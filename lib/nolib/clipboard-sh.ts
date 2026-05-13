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
 * Image support uses PNG piping: `wl-copy --type image/png` and
 * `xclip -selection clipboard -t image/png -i` both accept a PNG byte
 * stream on stdin.  pngjs handles ARGB↔RGBA conversion.
 *
 * Loaded only by lib/nolib/clipboard.ts under the [sh] variant; no other
 * backend should consume this file (napi/ffi must use direct lib calls,
 * nolib[x11]/[portal] must use direct protocols).
 */

import { spawn } from "child_process";
// @ts-ignore -- pngjs lacks type declarations
import { PNG } from "pngjs";
import {
  getMechanism, listMechanisms, setMechanism, getPreferredMechanisms,
} from "../platform";

const IS_LINUX = process.platform === "linux";
const IS_MAC = process.platform === "darwin";

type CbImage = { width: number; height: number; data: Uint32Array };

const MAX_BUFFER = 256 * 1024 * 1024;   // 256MB, enough for reasonable images

async function runCapture(cmd: string, args: string[], input?: string | Buffer): Promise<{ ok: boolean; stdout: Buffer; stderr: Buffer }> {
  return await new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      resolve({ ok: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let errored = false;
    let settled = false;

    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve({
        ok,
        stdout: Buffer.concat(stdoutChunks, stdoutLen),
        stderr: Buffer.concat(stderrChunks, stderrLen),
      });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutLen + chunk.length > MAX_BUFFER) return;
      stdoutChunks.push(chunk);
      stdoutLen += chunk.length;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrLen + chunk.length > MAX_BUFFER) return;
      stderrChunks.push(chunk);
      stderrLen += chunk.length;
    });

    child.on("error", () => {
      errored = true;
      settle(false);
    });
    // Resolve on `exit`, not `close`. xclip and xsel daemonize themselves
    // to keep the X11 selection alive after the foreground process exits;
    // their daemon child inherits stdin/stdout and never closes them, so
    // `close` would hang forever. `exit` fires as soon as the parent
    // process terminates, which is what we want.
    child.on("exit", (code) => {
      settle(!errored && code === 0);
    });

    if (child.stdin) {
      child.stdin.on("error", () => { /* ignore EPIPE */ });
      if (input !== undefined) {
        try {
          child.stdin.end(input);
        } catch {
          /* ignore */
        }
      } else {
        try { child.stdin.end(); } catch {}
      }
    }
  });
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

async function wlHasText(): Promise<boolean> {
  const r = await runCapture("wl-paste", ["--list-types"]);
  if (!r.ok) return false;
  return /text\//.test(r.stdout.toString("utf8"));
}

async function wlGetText(): Promise<string> {
  const r = await runCapture("wl-paste", ["--no-newline", "--type", "text/plain;charset=utf-8"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

async function wlSetText(text: string): Promise<boolean> {
  return (await runCapture("wl-copy", ["--type", "text/plain;charset=utf-8"], text)).ok;
}

async function wlClear(): Promise<boolean> {
  return (await runCapture("wl-copy", ["--clear"])).ok;
}

async function xclipHasText(): Promise<boolean> {
  const r = await runCapture("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"]);
  if (!r.ok) return false;
  return /(^|\n)(UTF8_STRING|text\/plain|TEXT|STRING)(\n|$)/.test(r.stdout.toString("utf8"));
}

async function xclipGetText(): Promise<string> {
  const r = await runCapture("xclip", ["-selection", "clipboard", "-o"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

async function xclipSetText(text: string): Promise<boolean> {
  return (await runCapture("xclip", ["-selection", "clipboard", "-in"], text)).ok;
}

// ── wl-clipboard image support ───────────────────────────────────────

async function wlHasImage(): Promise<boolean> {
  const r = await runCapture("wl-paste", ["--list-types"]);
  if (!r.ok) return false;
  return /image\/png/.test(r.stdout.toString("utf8"));
}

async function wlGetImage(): Promise<CbImage | null> {
  const r = await runCapture("wl-paste", ["--no-newline", "--type", "image/png"]);
  if (!r.ok || r.stdout.length === 0) return null;
  let decoded;
  try { decoded = PNG.sync.read(r.stdout); } catch { return null; }
  const { width, height, data } = decoded;
  const out = new Uint32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = ((data[o + 3] & 0xff) << 24) | ((data[o] & 0xff) << 16) | ((data[o + 1] & 0xff) << 8) | (data[o + 2] & 0xff);
  }
  return { width, height, data: out };
}

async function wlSetImage(w: number, h: number, d: Uint32Array): Promise<boolean> {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const pixel = d[i];
    const o = i * 4;
    png.data[o]     = (pixel >>> 16) & 0xff;
    png.data[o + 1] = (pixel >>> 8) & 0xff;
    png.data[o + 2] = pixel & 0xff;
    png.data[o + 3] = (pixel >>> 24) & 0xff;
  }
  const buf = PNG.sync.write(png);
  return (await runCapture("wl-copy", ["--type", "image/png"], buf)).ok;
}

// ── xclip image support ─────────────────────────────────────────────

async function xclipHasImage(): Promise<boolean> {
  const r = await runCapture("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"]);
  if (!r.ok) return false;
  return /(^|\n)image\/png(\n|$)/.test(r.stdout.toString("utf8"));
}

async function xclipGetImage(): Promise<CbImage | null> {
  const r = await runCapture("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]);
  if (!r.ok || r.stdout.length === 0) return null;
  let decoded;
  try { decoded = PNG.sync.read(r.stdout); } catch { return null; }
  const { width, height, data } = decoded;
  const out = new Uint32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = ((data[o + 3] & 0xff) << 24) | ((data[o] & 0xff) << 16) | ((data[o + 1] & 0xff) << 8) | (data[o + 2] & 0xff);
  }
  return { width, height, data: out };
}

async function xclipSetImage(w: number, h: number, d: Uint32Array): Promise<boolean> {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const pixel = d[i];
    const o = i * 4;
    png.data[o]     = (pixel >>> 16) & 0xff;
    png.data[o + 1] = (pixel >>> 8) & 0xff;
    png.data[o + 2] = pixel & 0xff;
    png.data[o + 3] = (pixel >>> 24) & 0xff;
  }
  const buf = PNG.sync.write(png);
  return (await runCapture("xclip", ["-selection", "clipboard", "-t", "image/png", "-i"], buf)).ok;
}

async function xselHasText(): Promise<boolean> {
  const r = await runCapture("xsel", ["--clipboard", "--output"]);
  return r.ok && r.stdout.length > 0;
}

async function xselGetText(): Promise<string> {
  const r = await runCapture("xsel", ["--clipboard", "--output"]);
  return r.ok ? r.stdout.toString("utf8") : "";
}

async function xselSetText(text: string): Promise<boolean> {
  return (await runCapture("xsel", ["--clipboard", "--input"], text)).ok;
}

// Linux dispatcher: try the user's preferred clipboard mechanism, fall
// through to the next available one only if the primary call *threw* —
// an empty string / false return is a legitimate answer and must not
// trigger cascade.

interface LinuxImpl {
  clear: () => Promise<boolean>;
  hasText: () => Promise<boolean>;
  getText: () => Promise<string>;
  setText: (s: string) => Promise<boolean>;
  hasImage: () => Promise<boolean>;
  getImage: () => Promise<CbImage | null>;
  setImage: (w: number, h: number, d: Uint32Array) => Promise<boolean>;
}

const NO_IMAGE: Pick<LinuxImpl, "hasImage" | "getImage" | "setImage"> = {
  hasImage: async () => false,
  getImage: async () => null,
  setImage: async () => false,
};

const LINUX_IMPLS: Record<string, LinuxImpl> = {
  "wl-clipboard": { clear: wlClear, hasText: wlHasText, getText: wlGetText, setText: wlSetText, hasImage: wlHasImage, getImage: wlGetImage, setImage: wlSetImage },
  "xclip":        { clear: () => xclipSetText(""), hasText: xclipHasText, getText: xclipGetText, setText: xclipSetText, hasImage: xclipHasImage, getImage: xclipGetImage, setImage: xclipSetImage },
  "xsel":         { clear: () => xselSetText(""), hasText: xselHasText, getText: xselGetText, setText: xselSetText, ...NO_IMAGE },
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

async function linuxRun<T>(op: (impl: LinuxImpl) => Promise<T>, fallback: T): Promise<T> {
  const order = linuxDispatchOrder();
  for (const name of order) {
    const impl = LINUX_IMPLS[name];
    if (!impl) continue;
    try {
      const r = await op(impl);
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

async function macGetText(): Promise<string> {
  const r = await runCapture("pbpaste", []);
  return r.ok ? r.stdout.toString("utf8") : "";
}

async function macSetText(text: string): Promise<boolean> {
  return (await runCapture("pbcopy", [], text)).ok;
}

async function macHasText(): Promise<boolean> {
  return (await macGetText()).length > 0;
}

async function macClear(): Promise<boolean> {
  return (await runCapture("pbcopy", [], "")).ok;
}

// ═══════════════════════════════════════════════════════════════════════
// Exports — platform-dispatched
// ═══════════════════════════════════════════════════════════════════════

export async function clipboard_clear(): Promise<boolean> {
  let ok = false;
  if (IS_LINUX) ok = await linuxRun(i => i.clear(), false);
  else if (IS_MAC) ok = await macClear();
  if (ok) bumpSeq();
  return ok;
}

export async function clipboard_hasText(): Promise<boolean> {
  if (IS_LINUX) return linuxRun(i => i.hasText(), false);
  if (IS_MAC) return macHasText();
  return false;
}

export async function clipboard_getText(): Promise<string> {
  if (IS_LINUX) return linuxRun(i => i.getText(), "");
  if (IS_MAC) return macGetText();
  return "";
}

export async function clipboard_setText(text: string): Promise<boolean> {
  let ok = false;
  if (IS_LINUX) ok = await linuxRun(i => i.setText(text), false);
  else if (IS_MAC) ok = await macSetText(text);
  if (ok) bumpSeq();
  return ok;
}

export async function clipboard_hasImage(): Promise<boolean> {
  if (IS_LINUX) return linuxRun(i => i.hasImage(), false);
  return false;
}

export async function clipboard_getImage(): Promise<CbImage | null> {
  if (IS_LINUX) return linuxRun(i => i.getImage(), null);
  return null;
}

export async function clipboard_setImage(w: number, h: number, d: Uint32Array): Promise<boolean> {
  if (w <= 0 || h <= 0 || d.length < w * h) return false;
  let ok = false;
  if (IS_LINUX) ok = await linuxRun(i => i.setImage(w, h, d), false);
  if (ok) bumpSeq();
  return ok;
}

export function clipboard_getSequence(): number {
  return _seq;
}
