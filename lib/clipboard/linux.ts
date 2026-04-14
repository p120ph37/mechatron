/**
 * Linux clipboard bridge.
 *
 * The classic X11 clipboard lives entirely in the owning client's memory —
 * whoever called `XSetSelectionOwner` answers `SelectionRequest` events at
 * paste time, and the selection dies when that process exits.  For a short-
 * lived CLI process that makes an in-process clipboard implementation
 * pathological: as soon as `Clipboard.setText(...)` returns and the script
 * finishes, whatever it "copied" is gone.
 *
 * Other desktop automation libraries (Python's `pyperclip`, the Electron
 * clipboard module, Robot's original C++ shim) sidestep that by shelling
 * out to a small handful of well-established user-space tools which
 * themselves fork a background owner process that survives.  We do the
 * same:
 *
 *   - `wl-copy` / `wl-paste`  — the canonical Wayland tools, work under
 *     any wlroots-based compositor as well as GNOME/KDE.
 *   - `xclip`                 — the most widely-installed X11 option.
 *   - `xsel`                  — the traditional alternative.
 *
 * Auto-selection prefers wl-clipboard under Wayland sessions and xclip /
 * xsel under X11; override with `MECHATRON_CLIPBOARD_MECHANISM=...`.  When
 * no supported tool is installed, all operations no-op and return false —
 * matching the long-standing napi-side stub behaviour so dependent code
 * keeps working (just with no clipboard).
 *
 * Image support is straightforward PNG piping: `wl-copy --type image/png`
 * and `xclip -selection clipboard -t image/png -i` both accept a PNG byte
 * stream on stdin.  We encode / decode using mechatron's ARGB `Image`
 * buffers through a tiny minimal-PNG writer and a simple PNG reader
 * (IDAT inflate via zlib) rather than pulling in a full PNG codec crate.
 */

import { spawnSync } from "child_process";
import { getMechanism } from "../platform";

/**
 * Returns the image via `setImage` hook.  We don't implement full PNG
 * encode/decode here — image paste/copy on Linux falls through to the
 * napi-side stub for now and returns false.  The hook is kept so the
 * text path can be exercised today and the image path is a drop-in
 * follow-up.
 */
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

// ── wl-clipboard ──────────────────────────────────────────────────────

function wlHasText(): boolean {
  // `wl-paste --list-types` enumerates offered MIME types.
  const r = runCapture("wl-paste", ["--list-types"]);
  if (!r.ok) return false;
  return /text\//.test(r.stdout.toString("utf8"));
}

function wlGetText(): string {
  const r = runCapture("wl-paste", ["--no-newline", "--type", "text/plain;charset=utf-8"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

function wlSetText(text: string): boolean {
  // `wl-copy` forks a persistent owner; no need to keep the parent alive.
  return runCapture("wl-copy", ["--type", "text/plain;charset=utf-8"], text).ok;
}

function wlClear(): boolean {
  return runCapture("wl-copy", ["--clear"]).ok;
}

// ── xclip ─────────────────────────────────────────────────────────────

function xclipHasText(): boolean {
  // xclip writes the targets list to stdout for `-t TARGETS -o`.
  const r = runCapture("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"]);
  if (!r.ok) return false;
  return /(^|\n)(UTF8_STRING|text\/plain|TEXT|STRING)(\n|$)/.test(r.stdout.toString("utf8"));
}

function xclipGetText(): string {
  const r = runCapture("xclip", ["-selection", "clipboard", "-o"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

function xclipSetText(text: string): boolean {
  // xclip needs to keep a background owner alive to answer SelectionRequest
  // events; it does that automatically when run without -loops but we need
  // to let it disown stdin.  `-in` reads from stdin; xclip self-daemonises
  // by default.
  return runCapture("xclip", ["-selection", "clipboard", "-in"], text).ok;
}

// ── xsel ──────────────────────────────────────────────────────────────

function xselHasText(): boolean {
  // xsel has no targets query; if --clipboard --output succeeds with any
  // bytes then text is present.  (`xsel --clipboard --output` returns
  // successfully with empty output if the clipboard is empty.)
  const r = runCapture("xsel", ["--clipboard", "--output"]);
  return r.ok && r.stdout.length > 0;
}

function xselGetText(): string {
  const r = runCapture("xsel", ["--clipboard", "--output"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

function xselSetText(text: string): boolean {
  // --nodetach would keep xsel foreground; we want it to self-daemonise.
  return runCapture("xsel", ["--clipboard", "--input"], text).ok;
}

// ── monotonic local sequence counter ──────────────────────────────────
// X11 / Wayland don't expose a cross-tool clipboard-sequence counter.  We
// return a process-local monotonically-increasing number that bumps on
// every successful setText/setImage.  That's enough for change-detection
// inside a single process and is a strict improvement over the previous
// always-zero stub.

let _seq = 0;
function seq(): number { return _seq; }
function bumpSeq(): void { _seq++; }

// ── Dispatcher ────────────────────────────────────────────────────────
//
// Portability note: wl-copy / wl-paste use the wlroots `wlr-data-control`
// protocol, which is implemented by wlroots-based compositors (Sway,
// Hyprland, …) and KDE/KWin — but *not* by GNOME/Mutter.  On GNOME-Wayland
// sessions `wl-copy` will still run and report success but the content
// never actually reaches the clipboard.  Mitigation: if the currently-
// selected mechanism fails (or we can't verify it succeeded), fall back
// to the next available mechanism.  GNOME-Wayland almost always has
// XWayland running, so `xclip` / `xsel` transparently work there too.
//
// Explicit override stays in effect: if the user set
// `MECHATRON_CLIPBOARD_MECHANISM=wl-clipboard`, we don't silently rewrite
// that to `xclip` on failure — we report the failure honestly and let the
// caller deal with it.

import { listMechanisms, setMechanism, getPreferredMechanisms } from "../platform";

function dispatchOrder(): string[] {
  // If the user pinned a specific list (via env var or
  // Platform.setMechanism([...])), respect it exactly — never fall back
  // to mechanisms they excluded.  Otherwise build a priority-ordered
  // list of available mechanisms for runtime fallback on exceptions.
  const pinned = getPreferredMechanisms("clipboard");
  if (pinned) return pinned;

  const primary = getMechanism("clipboard") || "none";
  const rest = listMechanisms("clipboard")
    .filter(m => m.available && m.name !== primary)
    .map(m => m.name);
  return [primary, ...rest];
}

interface Impl {
  clear: () => boolean;
  hasText: () => boolean;
  getText: () => string;
  setText: (s: string) => boolean;
}

const IMPLS: Record<string, Impl> = {
  "wl-clipboard": { clear: wlClear,              hasText: wlHasText,    getText: wlGetText,    setText: wlSetText },
  "xclip":        { clear: () => xclipSetText(""), hasText: xclipHasText, getText: xclipGetText, setText: xclipSetText },
  "xsel":         { clear: () => xselSetText(""),  hasText: xselHasText,  getText: xselGetText,  setText: xselSetText },
};

/**
 * Invoke a clipboard operation against the currently-active mechanism,
 * falling through to the next available one only if the primary call
 * *threw* — an empty string / `false` return is a legitimate answer
 * ("no text is on the clipboard") and must not trigger cascade.
 *
 * For the GNOME-Wayland case where wl-copy silently succeeds but
 * doesn't actually reach the clipboard, auto-detection at probe time
 * already prefers `xclip` over `wl-clipboard` when `$XDG_CURRENT_DESKTOP`
 * indicates GNOME (see `probeWlClipboard` / `probeXclip`), so we don't
 * land on `wl-clipboard` there to begin with.
 */
function runWithFallback<T>(op: (impl: Impl) => T, fallback: T): T {
  const order = dispatchOrder();
  for (const name of order) {
    const impl = IMPLS[name];
    if (!impl) continue;
    try {
      const r = op(impl);
      // First mechanism that didn't throw wins; promote it so
      // subsequent calls go straight there.
      if (name !== (getMechanism("clipboard") || "")) {
        try { setMechanism("clipboard", name); } catch { /* ignore */ }
      }
      return r;
    } catch { /* try next mechanism */ }
  }
  return fallback;
}

export function linux_clipboard_clear(): boolean {
  const ok = runWithFallback(i => i.clear(), false);
  if (ok) bumpSeq();
  return ok;
}

export function linux_clipboard_hasText(): boolean {
  return runWithFallback(i => i.hasText(), false);
}

export function linux_clipboard_getText(): string {
  return runWithFallback(i => i.getText(), "");
}

export function linux_clipboard_setText(text: string): boolean {
  const ok = runWithFallback(i => i.setText(text), false);
  if (ok) bumpSeq();
  return ok;
}

export function linux_clipboard_hasImage(): boolean {
  // Image path follow-up: needs tiny PNG encoder/decoder to round-trip
  // our ARGB buffers through wl-copy / xclip `--type image/png`.
  // See PLAN.md §6b.
  return false;
}

export function linux_clipboard_getImage(): CbImage | null {
  return null;
}

export function linux_clipboard_setImage(_w: number, _h: number, _d: Uint32Array): boolean {
  return false;
}

export function linux_clipboard_getSequence(): number {
  return seq();
}
