/**
 * nolib[x11] clipboard backend — ICCCM CLIPBOARD selection over xproto.
 *
 * Pure-TS implementation of the X11 selection protocol via the wire-level
 * xproto layer (lib/x11proto/*). Owns the CLIPBOARD selection from a
 * dedicated invisible window, answers SelectionRequest events with
 * UTF8_STRING / STRING / TARGETS / TIMESTAMP targets, and resolves
 * SelectionNotify replies for paste.
 *
 * Architectural intent: feature parity with napi[x11]'s clipboard impl
 * (which uses libX11 via Rust). text + sequence are implemented; image
 * clipboard via TARGETS=image/png is TODO and needs a tiny PNG codec.
 *
 * Loaded only by lib/nolib/clipboard.ts under the [x11] variant.
 * Requires $DISPLAY (a reachable X server).
 */

import { getXConnection } from "../x11proto/xconn";
import type { XConnection } from "../x11proto/conn";
import {
  EVENT_SELECTION_REQUEST, EVENT_SELECTION_NOTIFY,
  parseSelectionRequestEvent, parseSelectionNotifyEvent,
  PROP_MODE_REPLACE,
} from "../x11proto/request";

let _clipWin = 0;
let _clipText: string | null = null;
let _clipPng: Buffer | null = null;
let _offSelReq: (() => void) | null = null;
let _seq = 0;

interface ClipAtoms {
  CLIPBOARD: number;
  UTF8_STRING: number;
  STRING: number;
  TARGETS: number;
  ATOM: number;
  TIMESTAMP: number;
  INTEGER: number;
  IMAGE_PNG: number;
  _MECHATRON_SEL: number;
}
let _atoms: ClipAtoms | null = null;

async function init(): Promise<{ c: XConnection; win: number; a: ClipAtoms } | null> {
  const c = await getXConnection();
  if (!c) return null;
  if (!_clipWin) {
    const root = c.info.screens[0]?.root;
    if (!root) return null;
    _clipWin = c.createWindow(root);
  }
  if (!_atoms) {
    const [CLIPBOARD, UTF8_STRING, STRING, TARGETS, ATOM, TIMESTAMP, INTEGER, IMAGE_PNG, _MECHATRON_SEL] =
      await Promise.all([
        c.internAtom("CLIPBOARD"),
        c.internAtom("UTF8_STRING"),
        c.internAtom("STRING"),
        c.internAtom("TARGETS"),
        c.internAtom("ATOM"),
        c.internAtom("TIMESTAMP"),
        c.internAtom("INTEGER"),
        c.internAtom("image/png"),
        c.internAtom("_MECHATRON_SEL"),
      ]);
    _atoms = { CLIPBOARD, UTF8_STRING, STRING, TARGETS, ATOM, TIMESTAMP, INTEGER, IMAGE_PNG, _MECHATRON_SEL };
  }
  return { c, win: _clipWin, a: _atoms };
}

function handleSelectionRequest(c: XConnection, a: ClipAtoms, event: Buffer): void {
  const req = parseSelectionRequestEvent(event);
  if (req.selection !== a.CLIPBOARD) return;

  const property = req.property || req.target;
  let success = false;

  if (req.target === a.TARGETS) {
    const targets = [a.UTF8_STRING, a.STRING, a.TARGETS, a.TIMESTAMP];
    if (_clipPng) targets.push(a.IMAGE_PNG);
    const data = Buffer.allocUnsafe(targets.length * 4);
    for (let i = 0; i < targets.length; i++) data.writeUInt32LE(targets[i], i * 4);
    c.changeProperty({
      mode: PROP_MODE_REPLACE, window: req.requestor,
      property, type: a.ATOM, format: 32, data,
    });
    success = true;
  } else if (req.target === a.IMAGE_PNG && _clipPng) {
    c.changeProperty({
      mode: PROP_MODE_REPLACE, window: req.requestor,
      property, type: a.IMAGE_PNG, format: 8, data: _clipPng,
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

async function getText(): Promise<string> {
  const ctx = await init();
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

async function setText(text: string): Promise<boolean> {
  const ctx = await init();
  if (!ctx) return false;
  const { c, win, a } = ctx;

  _clipText = text;

  if (!_offSelReq) {
    _offSelReq = c.onEvent(EVENT_SELECTION_REQUEST, (buf) => {
      handleSelectionRequest(c, a, buf);
    });
  }

  c.setSelectionOwner(win, a.CLIPBOARD);
  _seq++;
  return true;
}

async function hasText(): Promise<boolean> {
  const ctx = await init();
  if (!ctx) return false;
  const owner = await ctx.c.getSelectionOwner(ctx.a.CLIPBOARD);
  return owner !== 0;
}

async function clear(): Promise<boolean> {
  const ctx = await init();
  if (!ctx) return false;
  const { c, win, a } = ctx;

  const owner = await c.getSelectionOwner(a.CLIPBOARD);
  if (owner === win) {
    c.setSelectionOwner(0, a.CLIPBOARD);
  }
  _clipText = null;
  _clipPng = null;
  _seq++;
  return true;
}

// ── Exports ────────────────────────────────────────────────────────────

export function clipboard_clear(): Promise<boolean> {
  return clear();
}

export function clipboard_hasText(): Promise<boolean> {
  return hasText();
}

export function clipboard_getText(): Promise<string> {
  return getText();
}

export function clipboard_setText(text: string): Promise<boolean> {
  return setText(text);
}

export async function clipboard_hasImage(): Promise<boolean> {
  const ctx = await init();
  if (!ctx) return false;
  const { c, win, a } = ctx;

  if (_clipPng) return true;

  const owner = await c.getSelectionOwner(a.CLIPBOARD);
  if (owner === 0 || owner === win) return false;

  c.deleteProperty(win, a._MECHATRON_SEL);
  c.convertSelection(win, a.CLIPBOARD, a.TARGETS, a._MECHATRON_SEL);

  try {
    const evt = await c.waitForEvent(
      EVENT_SELECTION_NOTIFY,
      (buf) => parseSelectionNotifyEvent(buf).requestor === win,
      2000,
    );
    const parsed = parseSelectionNotifyEvent(evt);
    if (parsed.property === 0) return false;

    const prop = await c.getProperty({
      window: win, property: a._MECHATRON_SEL,
      type: 0, longOffset: 0, longLength: 1_000_000, delete: true,
    });
    if (!prop.value || prop.format !== 32) return false;

    for (let i = 0; i + 3 < prop.value.length; i += 4) {
      if (prop.value.readUInt32LE(i) === a.IMAGE_PNG) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function clipboard_getImage(): Promise<{ width: number; height: number; data: Uint32Array } | null> {
  const ctx = await init();
  if (!ctx) return null;
  const { c, win, a } = ctx;

  let pngBuf: Buffer;

  if (_clipPng) {
    pngBuf = _clipPng;
  } else {
    c.deleteProperty(win, a._MECHATRON_SEL);
    c.convertSelection(win, a.CLIPBOARD, a.IMAGE_PNG, a._MECHATRON_SEL);

    try {
      const evt = await c.waitForEvent(
        EVENT_SELECTION_NOTIFY,
        (buf) => parseSelectionNotifyEvent(buf).requestor === win,
        2000,
      );
      const parsed = parseSelectionNotifyEvent(evt);
      if (parsed.property === 0) return null;

      const prop = await c.getProperty({
        window: win, property: a._MECHATRON_SEL,
        type: 0, longOffset: 0, longLength: 16_000_000, delete: true,
      });
      if (!prop.value || prop.value.length === 0) return null;
      pngBuf = prop.value;
    } catch {
      return null;
    }
  }

  try {
    // @ts-ignore
    const { PNG } = require("pngjs");
    const png = PNG.sync.read(pngBuf);
    const pixels = new Uint32Array(png.width * png.height);
    for (let i = 0; i < pixels.length; i++) {
      const r = png.data[i * 4];
      const g = png.data[i * 4 + 1];
      const b = png.data[i * 4 + 2];
      const a = png.data[i * 4 + 3];
      pixels[i] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    }
    return { width: png.width, height: png.height, data: pixels };
  } catch {
    return null;
  }
}

export async function clipboard_setImage(w: number, h: number, d: Uint32Array): Promise<boolean> {
  const ctx = await init();
  if (!ctx) return false;
  const { c, win, a } = ctx;

  try {
    // @ts-ignore
    const { PNG } = require("pngjs");
    const png = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
      const px = d[i];
      png.data[i * 4]     = (px >> 16) & 0xFF;
      png.data[i * 4 + 1] = (px >> 8) & 0xFF;
      png.data[i * 4 + 2] = px & 0xFF;
      png.data[i * 4 + 3] = (px >> 24) & 0xFF;
    }
    _clipPng = PNG.sync.write(png);

    if (!_offSelReq) {
      _offSelReq = c.onEvent(EVENT_SELECTION_REQUEST, (buf) => {
        handleSelectionRequest(c, a, buf);
      });
    }

    c.setSelectionOwner(win, a.CLIPBOARD);
    _seq++;
    return true;
  } catch {
    return false;
  }
}

export function clipboard_getSequence(): number {
  return _seq;
}

if (!process.env.DISPLAY) {
  throw new Error("nolib/clipboard[x11]: requires $DISPLAY");
}
