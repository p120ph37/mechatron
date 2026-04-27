/**
 * nolib[sh] clipboard backend — subprocess bridge.
 *
 * Linux: wl-copy / wl-paste (Wayland), xclip (X11), or xsel (X11) — chosen
 *   at runtime by the platform mechanism probe; the first that succeeds
 *   wins and is sticky for the rest of the process.
 * macOS: pbcopy / pbpaste.
 *
 * Why subprocesses at all?  The classic X11 clipboard lives entirely in
 * the owning client's memory — whoever called `XSetSelectionOwner`
 * answers `SelectionRequest` events at paste time, and the selection dies
 * when that process exits.  For a short-lived CLI process that makes an
 * in-process clipboard pathological: as soon as `Clipboard.setText(...)`
 * returns and the script finishes, whatever it "copied" is gone.  The
 * established workaround (used by `pyperclip`, the Electron clipboard
 * module, etc.) is to shell out to a small handful of well-established
 * user-space tools which themselves fork a background owner process that
 * survives.
 *
 * Image support is straightforward PNG piping: `wl-copy --type image/png`
 * and `xclip -selection clipboard -t image/png -i` both accept a PNG byte
 * stream on stdin.  Currently TODO — needs a tiny PNG encoder/decoder for
 * ARGB buffers.  See PLAN.md §6b.
 *
 * Loaded only by lib/nolib/clipboard.ts under the [sh] variant; no other
 * backend should consume this file (napi/ffi must use direct lib calls,
 * nolib[x11]/[portal] must use direct protocols).
 */

import { spawnSync } from "child_process";
import {
  getMechanism, listMechanisms, setMechanism, getPreferredMechanisms,
} from "../platform";

const IS_LINUX = process.platform === "linux";
const IS_MAC = process.platform === "darwin";

type CbImage = { width: number; height: number; data: Uint32Array };

function runCapture(cmd: string, args: string[], input?: string | Buffer): { ok: boolean; stdout: Buffer; stderr: Buffer } {
  const r = spawnSync(cmd, args, {
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,   // 256MB, enough for reasonable images
  });
  return {
    ok: r.status === 0 && !r.error,
    stdout: r.stdout || Buffer.alloc(0),
    stderr: r.stderr || Buffer.alloc(0),
  };
}

// ── monotonic local sequence counter ──────────────────────────────────
// X11 / Wayland don't expose a cross-tool clipboard-sequence counter.  We
// return a process-local monotonically-increasing number that bumps on
// every successful setText/setImage.  That's enough for change-detection
// inside a single process and is a strict improvement over the previous
// always-zero stub.

let _seq = 0;
function bumpSeq(): void { _seq++; }

// ═══════════════════════════════════════════════════════════════════════
// Linux — wl-clipboard / xclip / xsel
// ═══════════════════════════════════════════════════════════════════════

function wlHasText(): boolean {
  const r = runCapture("wl-paste", ["--list-types"]);
  if (!r.ok) return false;
  return /text\//.test(r.stdout.toString("utf8"));
}

function wlGetText(): string {
  const r = runCapture("wl-paste", ["--no-newline", "--type", "text/plain;charset=utf-8"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

function wlSetText(text: string): boolean {
  return runCapture("wl-copy", ["--type", "text/plain;charset=utf-8"], text).ok;
}

function wlClear(): boolean {
  return runCapture("wl-copy", ["--clear"]).ok;
}

function xclipHasText(): boolean {
  const r = runCapture("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"]);
  if (!r.ok) return false;
  return /(^|\n)(UTF8_STRING|text\/plain|TEXT|STRING)(\n|$)/.test(r.stdout.toString("utf8"));
}

function xclipGetText(): string {
  const r = runCapture("xclip", ["-selection", "clipboard", "-o"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

function xclipSetText(text: string): boolean {
  return runCapture("xclip", ["-selection", "clipboard", "-in"], text).ok;
}

function xselHasText(): boolean {
  const r = runCapture("xsel", ["--clipboard", "--output"]);
  return r.ok && r.stdout.length > 0;
}

function xselGetText(): string {
  const r = runCapture("xsel", ["--clipboard", "--output"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

function xselSetText(text: string): boolean {
  return runCapture("xsel", ["--clipboard", "--input"], text).ok;
}

// Linux dispatcher: try the user's preferred clipboard mechanism, fall
// through to the next available one only if the primary call *threw* —
// an empty string / false return is a legitimate answer and must not
// trigger cascade. GNOME-Wayland's wl-copy silently succeeds but never
// actually reaches the clipboard; auto-detection at probe time already
// prefers xclip there, so we don't land on wl-clipboard to begin with.

interface LinuxImpl {
  clear: () => boolean;
  hasText: () => boolean;
  getText: () => string;
  setText: (s: string) => boolean;
}

const LINUX_IMPLS: Record<string, LinuxImpl> = {
  "wl-clipboard": { clear: wlClear,                hasText: wlHasText,    getText: wlGetText,    setText: wlSetText },
  "xclip":        { clear: () => xclipSetText(""), hasText: xclipHasText, getText: xclipGetText, setText: xclipSetText },
  "xsel":         { clear: () => xselSetText(""),  hasText: xselHasText,  getText: xselGetText,  setText: xselSetText },
};

function linuxDispatchOrder(): string[] {
  const pinned = getPreferredMechanisms("clipboard");
  if (pinned) return pinned;
  const primary = getMechanism("clipboard") || "none";
  const rest = listMechanisms("clipboard")
    .filter(m => m.available && m.name !== primary)
    .map(m => m.name);
  return [primary, ...rest];
}

function linuxRun<T>(op: (impl: LinuxImpl) => T, fallback: T): T {
  const order = linuxDispatchOrder();
  for (const name of order) {
    const impl = LINUX_IMPLS[name];
    if (!impl) continue;
    try {
      const r = op(impl);
      if (name !== (getMechanism("clipboard") || "")) {
        try { setMechanism("clipboard", name); } catch { /* ignore */ }
      }
      return r;
    } catch { /* try next mechanism */ }
  }
  return fallback;
}

// ═══════════════════════════════════════════════════════════════════════
// macOS — pbcopy / pbpaste
// ═══════════════════════════════════════════════════════════════════════

function macGetText(): string {
  const r = runCapture("pbpaste", []);
  return r.ok ? r.stdout.toString("utf8") : "";
}

function macSetText(text: string): boolean {
  return runCapture("pbcopy", [], text).ok;
}

function macHasText(): boolean {
  return macGetText().length > 0;
}

function macClear(): boolean {
  return runCapture("pbcopy", [], "").ok;
}

// ═══════════════════════════════════════════════════════════════════════
// Exports — platform-dispatched
// ═══════════════════════════════════════════════════════════════════════

export function clipboard_clear(): boolean {
  let ok = false;
  if (IS_LINUX) ok = linuxRun(i => i.clear(), false);
  else if (IS_MAC) ok = macClear();
  if (ok) bumpSeq();
  return ok;
}

export function clipboard_hasText(): boolean {
  if (IS_LINUX) return linuxRun(i => i.hasText(), false);
  if (IS_MAC) return macHasText();
  return false;
}

export function clipboard_getText(): string {
  if (IS_LINUX) return linuxRun(i => i.getText(), "");
  if (IS_MAC) return macGetText();
  return "";
}

export function clipboard_setText(text: string): boolean {
  let ok = false;
  if (IS_LINUX) ok = linuxRun(i => i.setText(text), false);
  else if (IS_MAC) ok = macSetText(text);
  if (ok) bumpSeq();
  return ok;
}

export function clipboard_hasImage(): boolean {
  return false;
}

export function clipboard_getImage(): CbImage | null {
  return null;
}

export function clipboard_setImage(_w: number, _h: number, _d: Uint32Array): boolean {
  return false;
}

export function clipboard_getSequence(): number {
  return _seq;
}
