/**
 * nolib clipboard backend — pure TypeScript, no native libraries.
 *
 * Variant dispatch:
 *   x11 — X11 selections protocol over the wire (requires $DISPLAY)
 *   sh  — subprocess bridge (xclip/xsel/wl-copy on Linux, pbcopy on macOS)
 */

import { getRequestedVariant } from "../backend";

const IS_LINUX = process.platform === "linux";
const IS_MAC = process.platform === "darwin";

const variant = getRequestedVariant();

// ═══════════════════════════════════════════════════════════════════════
// x11 variant — ICCCM CLIPBOARD selection via X11 wire protocol
// ═══════════════════════════════════════════════════════════════════════

import { getXConnection } from "../x11proto/xconn";
import type { XConnection } from "../x11proto/conn";
import {
  EVENT_SELECTION_REQUEST, EVENT_SELECTION_NOTIFY,
  parseSelectionRequestEvent, parseSelectionNotifyEvent,
  PROP_MODE_REPLACE,
} from "../x11proto/request";

let _clipWin = 0;
let _clipText: string | null = null;
let _offSelReq: (() => void) | null = null;

interface ClipAtoms {
  CLIPBOARD: number;
  UTF8_STRING: number;
  STRING: number;
  TARGETS: number;
  ATOM: number;
  TIMESTAMP: number;
  INTEGER: number;
  _MECHATRON_SEL: number;
}
let _atoms: ClipAtoms | null = null;

async function x11init(): Promise<{ c: XConnection; win: number; a: ClipAtoms } | null> {
  const c = await getXConnection();
  if (!c) return null;
  if (!_clipWin) {
    const root = c.info.screens[0]?.root;
    if (!root) return null;
    _clipWin = c.createWindow(root);
  }
  if (!_atoms) {
    const [CLIPBOARD, UTF8_STRING, STRING, TARGETS, ATOM, TIMESTAMP, INTEGER, _MECHATRON_SEL] =
      await Promise.all([
        c.internAtom("CLIPBOARD"),
        c.internAtom("UTF8_STRING"),
        c.internAtom("STRING"),
        c.internAtom("TARGETS"),
        c.internAtom("ATOM"),
        c.internAtom("TIMESTAMP"),
        c.internAtom("INTEGER"),
        c.internAtom("_MECHATRON_SEL"),
      ]);
    _atoms = { CLIPBOARD, UTF8_STRING, STRING, TARGETS, ATOM, TIMESTAMP, INTEGER, _MECHATRON_SEL };
  }
  return { c, win: _clipWin, a: _atoms };
}

function handleSelectionRequest(c: XConnection, a: ClipAtoms, event: Buffer): void {
  const req = parseSelectionRequestEvent(event);
  if (req.selection !== a.CLIPBOARD) return;

  let property = req.property || req.target;
  let success = false;

  if (req.target === a.TARGETS) {
    const data = Buffer.allocUnsafe(16);
    data.writeUInt32LE(a.UTF8_STRING, 0);
    data.writeUInt32LE(a.STRING, 4);
    data.writeUInt32LE(a.TARGETS, 8);
    data.writeUInt32LE(a.TIMESTAMP, 12);
    c.changeProperty({
      mode: PROP_MODE_REPLACE, window: req.requestor,
      property, type: a.ATOM, format: 32, data,
    });
    success = true;
  } else if ((req.target === a.UTF8_STRING || req.target === a.STRING) && _clipText !== null) {
    const data = Buffer.from(_clipText, "utf8");
    c.changeProperty({
      mode: PROP_MODE_REPLACE, window: req.requestor,
      property, type: a.UTF8_STRING, format: 8, data,
    });
    success = true;
  } else if (req.target === a.TIMESTAMP) {
    const data = Buffer.allocUnsafe(4);
    data.writeUInt32LE(0, 0);
    c.changeProperty({
      mode: PROP_MODE_REPLACE, window: req.requestor,
      property, type: a.INTEGER, format: 32, data,
    });
    success = true;
  }

  // Send SelectionNotify to the requestor
  const notify = Buffer.alloc(32);
  notify.writeUInt8(EVENT_SELECTION_NOTIFY, 0);
  notify.writeUInt32LE(req.time, 4);
  notify.writeUInt32LE(req.requestor, 8);
  notify.writeUInt32LE(req.selection, 12);
  notify.writeUInt32LE(req.target, 16);
  notify.writeUInt32LE(success ? property : 0, 20);
  c.sendEvent({ propagate: false, destination: req.requestor, eventMask: 0, event: notify });
}

async function x11GetText(): Promise<string> {
  const ctx = await x11init();
  if (!ctx) return "";
  const { c, win, a } = ctx;

  c.deleteProperty(win, a._MECHATRON_SEL);
  c.convertSelection(win, a.CLIPBOARD, a.UTF8_STRING, a._MECHATRON_SEL);

  try {
    const evt = await c.waitForEvent(
      EVENT_SELECTION_NOTIFY,
      (buf) => parseSelectionNotifyEvent(buf).requestor === win,
      2000,
    );
    const parsed = parseSelectionNotifyEvent(evt);
    if (parsed.property === 0) return "";

    const prop = await c.getProperty({
      window: win, property: a._MECHATRON_SEL,
      type: 0, longOffset: 0, longLength: 1_000_000, delete: true,
    });
    if (!prop.value || prop.value.length === 0) return "";
    return prop.value.toString("utf8");
  } catch {
    return "";
  }
}

async function x11SetText(text: string): Promise<void> {
  const ctx = await x11init();
  if (!ctx) return;
  const { c, win, a } = ctx;

  _clipText = text;

  if (!_offSelReq) {
    _offSelReq = c.onEvent(EVENT_SELECTION_REQUEST, (buf) => {
      handleSelectionRequest(c, a, buf);
    });
  }

  c.setSelectionOwner(win, a.CLIPBOARD);
}

async function x11HasText(): Promise<boolean> {
  const ctx = await x11init();
  if (!ctx) return false;
  const owner = await ctx.c.getSelectionOwner(ctx.a.CLIPBOARD);
  return owner !== 0;
}

async function x11Clear(): Promise<void> {
  const ctx = await x11init();
  if (!ctx) return;
  const { c, win, a } = ctx;

  const owner = await c.getSelectionOwner(a.CLIPBOARD);
  if (owner === win) {
    c.setSelectionOwner(0, a.CLIPBOARD);
  }
  _clipText = null;
}

// ═══════════════════════════════════════════════════════════════════════
// sh variant — subprocess bridge
// ═══════════════════════════════════════════════════════════════════════

import { execFileSync, execSync } from "child_process";

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

function shLinuxGetText(): string {
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

function shLinuxSetText(text: string): void {
  const tool = linuxTool();
  try {
    switch (tool) {
      case "xclip": execSync(`echo -n ${JSON.stringify(text)} | xclip -selection clipboard`, { timeout: 2000 }); break;
      case "xsel":  execSync(`echo -n ${JSON.stringify(text)} | xsel --clipboard --input`, { timeout: 2000 }); break;
      case "wl":    execSync(`echo -n ${JSON.stringify(text)} | wl-copy`, { timeout: 2000 }); break;
    }
  } catch {}
}

function shLinuxHasText(): boolean {
  return shLinuxGetText().length > 0;
}

function shLinuxClear(): void {
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

function shMacGetText(): string {
  try {
    return execFileSync("pbpaste", [], { encoding: "utf8", timeout: 2000 });
  } catch { return ""; }
}

function shMacSetText(text: string): void {
  try {
    execSync(`echo -n ${JSON.stringify(text)} | pbcopy`, { timeout: 2000 });
  } catch {}
}

function shMacHasText(): boolean {
  return shMacGetText().length > 0;
}

function shMacClear(): void {
  try {
    execSync("echo -n '' | pbcopy", { timeout: 2000 });
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════
// Dispatch — variant selection at load time
// ═══════════════════════════════════════════════════════════════════════

const useX11 = variant === "x11";

export function clipboard_clear(): void {
  if (useX11) { x11Clear(); return; }
  if (IS_LINUX) shLinuxClear();
  else if (IS_MAC) shMacClear();
}

export function clipboard_hasText(): boolean {
  if (useX11) return x11HasText() as any;
  if (IS_LINUX) return shLinuxHasText();
  if (IS_MAC) return shMacHasText();
  return false;
}

export function clipboard_getText(): string {
  if (useX11) return x11GetText() as any;
  if (IS_LINUX) return shLinuxGetText();
  if (IS_MAC) return shMacGetText();
  return "";
}

export function clipboard_setText(text: string): void {
  if (useX11) { x11SetText(text); return; }
  if (IS_LINUX) shLinuxSetText(text);
  else if (IS_MAC) shMacSetText(text);
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

if (useX11 && !process.env.DISPLAY) {
  throw new Error("nolib/clipboard[x11]: requires $DISPLAY");
}
if (variant === "sh" && !IS_LINUX && !IS_MAC) {
  throw new Error("nolib/clipboard[sh]: requires Linux or macOS");
}
