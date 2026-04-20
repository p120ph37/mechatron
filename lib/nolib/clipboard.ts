/**
 * nolib clipboard backend — pure TypeScript, no native libraries.
 *
 * Linux: subprocess bridge (xclip, xsel, wl-copy/wl-paste).
 * macOS: subprocess bridge (pbcopy/pbpaste).
 * Windows: not available (Win32 clipboard API requires native calls).
 */

import { execFileSync, execSync } from "child_process";

const IS_LINUX = process.platform === "linux";
const IS_MAC = process.platform === "darwin";

function which(cmd: string): boolean {
  try {
    execFileSync("/bin/sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── Linux: xclip / xsel / wl-copy+wl-paste ─────────────────────────

type LinuxTool = "xclip" | "xsel" | "wl" | null;
let _linuxTool: LinuxTool | undefined;

function linuxTool(): LinuxTool {
  if (_linuxTool !== undefined) return _linuxTool;
  if (process.env.WAYLAND_DISPLAY) {
    if (which("wl-copy") && which("wl-paste")) { _linuxTool = "wl"; return _linuxTool; }
  }
  if (which("xclip")) { _linuxTool = "xclip"; return _linuxTool; }
  if (which("xsel"))  { _linuxTool = "xsel";  return _linuxTool; }
  _linuxTool = null;
  return null;
}

function linuxGetText(): string {
  const tool = linuxTool();
  try {
    switch (tool) {
      case "xclip": return execFileSync("xclip", ["-selection", "clipboard", "-o"], { encoding: "utf8", timeout: 2000 });
      case "xsel":  return execFileSync("xsel", ["--clipboard", "--output"], { encoding: "utf8", timeout: 2000 });
      case "wl":    return execFileSync("wl-paste", ["--no-newline"], { encoding: "utf8", timeout: 2000 });
      default: return "";
    }
  } catch { return ""; }
}

function linuxSetText(text: string): void {
  const tool = linuxTool();
  try {
    switch (tool) {
      case "xclip": execSync(`echo -n ${JSON.stringify(text)} | xclip -selection clipboard`, { timeout: 2000 }); break;
      case "xsel":  execSync(`echo -n ${JSON.stringify(text)} | xsel --clipboard --input`, { timeout: 2000 }); break;
      case "wl":    execSync(`echo -n ${JSON.stringify(text)} | wl-copy`, { timeout: 2000 }); break;
    }
  } catch {}
}

function linuxHasText(): boolean {
  return linuxGetText().length > 0;
}

function linuxClear(): void {
  const tool = linuxTool();
  try {
    switch (tool) {
      case "xclip": execSync("echo -n '' | xclip -selection clipboard", { timeout: 2000 }); break;
      case "xsel":  execFileSync("xsel", ["--clipboard", "--clear"], { timeout: 2000 }); break;
      case "wl":    execSync("echo -n '' | wl-copy", { timeout: 2000 }); break;
    }
  } catch {}
}

// ── macOS: pbcopy / pbpaste ─────────────────────────────────────────

function macGetText(): string {
  try {
    return execFileSync("pbpaste", [], { encoding: "utf8", timeout: 2000 });
  } catch { return ""; }
}

function macSetText(text: string): void {
  try {
    execSync(`echo -n ${JSON.stringify(text)} | pbcopy`, { timeout: 2000 });
  } catch {}
}

function macHasText(): boolean {
  return macGetText().length > 0;
}

function macClear(): void {
  try {
    execSync("echo -n '' | pbcopy", { timeout: 2000 });
  } catch {}
}

// ── Dispatch ────────────────────────────────────────────────────────

export function clipboard_clear(): void {
  if (IS_LINUX) linuxClear();
  else if (IS_MAC) macClear();
}

export function clipboard_hasText(): boolean {
  if (IS_LINUX) return linuxHasText();
  if (IS_MAC) return macHasText();
  return false;
}

export function clipboard_getText(): string {
  if (IS_LINUX) return linuxGetText();
  if (IS_MAC) return macGetText();
  return "";
}

export function clipboard_setText(text: string): void {
  if (IS_LINUX) linuxSetText(text);
  else if (IS_MAC) macSetText(text);
}

export function clipboard_hasImage(): boolean {
  return false;
}

export function clipboard_getImage(): { width: number; height: number; data: Uint32Array } | null {
  return null;
}

export function clipboard_setImage(_width: number, _height: number, _data: Uint32Array): void {}

export function clipboard_getSequence(): number {
  return 0;
}

if (!IS_LINUX && !IS_MAC) {
  throw new Error("nolib/clipboard: requires Linux or macOS");
}
