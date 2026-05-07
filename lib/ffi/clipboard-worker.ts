/**
 * ffi[x11] clipboard worker — runs the ICCCM SELECTION protocol in a
 * dedicated Bun Worker so the X event loop can answer SelectionRequest
 * events from other applications even while the main thread is busy.
 *
 * Architecture mirrors napi[x11]'s background-thread design (see
 * napi/src/clipboard_x11.rs): a private X display connection, an event
 * loop that drains XEvents off the X fd asynchronously, and a request/
 * response channel for clipboard operations. Here the channel is
 * postMessage instead of mpsc; the X event loop is wired into Bun's
 * libuv via net.Socket on the X fd (libuv level-triggered epoll).
 *
 * The main thread (lib/ffi/clipboard.ts) sends `{ id, op, args }`
 * messages and resolves a Promise per id when the worker posts back
 * `{ id, result }`. Selection requests from other X clients are
 * processed entirely inside the worker — no main-thread involvement.
 */

import * as net from "net";
import { parentPort } from "worker_threads";
import {
  x11 as x11Syms, ffi as x11ffi,
  True, False,
  SelectionRequest, SelectionNotify, SelectionClear,
  PropModeReplace, XA_CARDINAL,
} from "./x11";
import { cstr } from "./bun";

// ── State ─────────────────────────────────────────────────────────────

let _display: any = null;
let _window = 0n;
let _X: ReturnType<typeof x11Syms> = null;
let _F: ReturnType<typeof x11ffi> = null;

let _CLIPBOARD = 0n;
let _UTF8_STRING = 0n;
let _STRING = 31n;
let _TARGETS = 0n;
let _ATOM = 4n;
let _TIMESTAMP = 0n;
let _IMAGE_PNG = 0n;
let _MECHATRON_SEL = 0n;

let _clipText: string | null = null;
let _clipPng: Uint8Array | null = null;
let _weOwnClipboard = false;
let _clipSeq = 0;

const SIZEOF_XEVENT = 192;

// One-shot resolvers waiting for the next SelectionNotify event.
type NotifyResolver = (ev: DataView | null) => void;
let _notifyWaiters: NotifyResolver[] = [];

// Worker performs at most one clipboard op at a time, so a single
// scratch buffer is sufficient for selection-property reads.
const longSize = process.arch === "x64" || process.arch === "arm64" ? 8 : 4;

// ── Initialization ────────────────────────────────────────────────────

function ensure(): boolean {
  if (_window !== 0n) return true;
  _X = x11Syms();
  _F = x11ffi();
  if (!_X || !_F) return false;

  _display = _X.XOpenDisplay(_F.ptr(cstr("")));
  if (!_display) return false;

  const root = _X.XDefaultRootWindow(_display);
  _window = _X.XCreateSimpleWindow(_display, root, 0, 0, 1, 1, 0, 0n, 0n);
  if (_window === 0n) return false;

  const ia = (name: string) =>
    _X!.XInternAtom(_display, _F!.ptr(cstr(name)), False);
  _CLIPBOARD = ia("CLIPBOARD");
  _UTF8_STRING = ia("UTF8_STRING");
  _TARGETS = ia("TARGETS");
  _TIMESTAMP = ia("TIMESTAMP");
  _IMAGE_PNG = ia("image/png");
  _MECHATRON_SEL = ia("_MECHATRON_SEL");

  // Wire the X fd into libuv's epoll set via a paused net.Socket. We
  // never call socket.read() — that would consume bytes from the kernel
  // before libX11 can read them. Instead, the 'readable' event tells us
  // bytes are available; XPending() makes libX11 read them into its
  // internal buffer. socket.read(0) re-arms libuv interest without
  // consuming. Level-triggered epoll (libuv default) keeps firing while
  // bytes remain unread, so this self-corrects if XPending is racy.
  const xfd = _X.XConnectionNumber(_display);
  const sock = new net.Socket({ fd: xfd, readable: true, writable: false });
  sock.pause();
  sock.on("readable", () => {
    drainEvents();
    sock.read(0);
  });
  sock.on("error", () => { /* swallow — display close races */ });

  return true;
}

// ── Event loop ────────────────────────────────────────────────────────

function drainEvents(): void {
  if (!_X || !_F || !_display) return;

  const evBuf = new Uint8Array(SIZEOF_XEVENT);
  const evDv = new DataView(evBuf.buffer);

  while (_X.XPending(_display) > 0) {
    _X.XNextEvent(_display, _F.ptr(evBuf));
    const type = evDv.getInt32(0, true);

    if (type === SelectionClear) {
      _weOwnClipboard = false;
      _clipSeq++;
    } else if (type === SelectionRequest) {
      handleSelectionRequest(evDv);
    } else if (type === SelectionNotify) {
      // Hand the event to the oldest waiter. The event buffer is reused
      // each iteration, so snapshot it before delivering.
      const snap = new DataView(evBuf.slice().buffer);
      const waiter = _notifyWaiters.shift();
      if (waiter) waiter(snap);
    }
  }
}

function handleSelectionRequest(ev: DataView): void {
  if (!_X || !_F || !_display) return;

  const requestor = ev.getBigUint64(40, true);
  const target = ev.getBigUint64(56, true);
  const property = ev.getBigUint64(64, true);
  const time = ev.getBigUint64(72, true);

  let replyProp = property;

  if (target === _TARGETS) {
    const targets: bigint[] = [_TARGETS, _TIMESTAMP];
    if (_clipText !== null) { targets.push(_UTF8_STRING); targets.push(_STRING); }
    if (_clipPng) targets.push(_IMAGE_PNG);
    const buf = new BigUint64Array(targets.length);
    for (let i = 0; i < targets.length; i++) buf[i] = targets[i];
    _X.XChangeProperty(_display, requestor, property, _ATOM, 32,
      PropModeReplace, _F.ptr(new Uint8Array(buf.buffer)), targets.length);
  } else if ((target === _UTF8_STRING || target === _STRING) && _clipText !== null) {
    const data = new TextEncoder().encode(_clipText);
    _X.XChangeProperty(_display, requestor, property, _UTF8_STRING, 8,
      PropModeReplace, _F.ptr(data), data.length);
  } else if (target === _IMAGE_PNG && _clipPng) {
    _X.XChangeProperty(_display, requestor, property, _IMAGE_PNG, 8,
      PropModeReplace, _F.ptr(_clipPng), _clipPng.length);
  } else if (target === _TIMESTAMP) {
    const buf = new BigUint64Array([0n]);
    _X.XChangeProperty(_display, requestor, property, XA_CARDINAL, 32,
      PropModeReplace, _F.ptr(new Uint8Array(buf.buffer)), 1);
  } else {
    replyProp = 0n;
  }

  const reply = new Uint8Array(SIZEOF_XEVENT);
  const rdv = new DataView(reply.buffer);
  rdv.setInt32(0, SelectionNotify, true);
  rdv.setBigUint64(32, requestor, true);
  rdv.setBigUint64(40, _CLIPBOARD, true);
  rdv.setBigUint64(48, target, true);
  rdv.setBigUint64(56, replyProp, true);
  rdv.setBigUint64(64, time, true);
  _X.XSendEvent(_display, requestor, False, 0n, _F.ptr(reply));
  _X.XFlush(_display);
}

function waitForSelectionNotify(timeoutMs: number): Promise<DataView | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ev: DataView | null) => {
      if (done) return;
      done = true;
      const idx = _notifyWaiters.indexOf(finish);
      if (idx >= 0) _notifyWaiters.splice(idx, 1);
      resolve(ev);
    };
    _notifyWaiters.push(finish);
    setTimeout(() => finish(null), timeoutMs);
  });
}

function readProperty(window: bigint, property: bigint): Uint8Array | null {
  if (!_X || !_F || !_display) return null;

  const actualType = new BigUint64Array(1);
  const actualFormat = new Int32Array(1);
  const nitems = new BigUint64Array(1);
  const bytesAfter = new BigUint64Array(1);
  const propRet = new BigUint64Array(1);

  const status = _X.XGetWindowProperty(
    _display, window, property, 0n, 4194304n, True, 0n,
    _F.ptr(actualType), _F.ptr(actualFormat),
    _F.ptr(nitems), _F.ptr(bytesAfter), _F.ptr(propRet),
  );
  if (status !== 0 || propRet[0] === 0n) return null;

  const n = Number(nitems[0]);
  const format = actualFormat[0];
  const byteLen = format === 32 ? n * longSize : format === 16 ? n * 2 : n;
  if (byteLen === 0) {
    _X.XFree(propRet[0]);
    return null;
  }

  const ptr = Number(propRet[0]);
  const result = new Uint8Array(_F.toArrayBuffer(ptr, 0, byteLen)).slice();
  _X.XFree(propRet[0]);
  return result;
}

async function hasTarget(target: bigint): Promise<boolean> {
  if (_X!.XGetSelectionOwner(_display, _CLIPBOARD) === 0n) return false;

  _X!.XDeleteProperty(_display, _window, _MECHATRON_SEL);
  _X!.XConvertSelection(_display, _CLIPBOARD, _TARGETS, _MECHATRON_SEL, _window, 0n);
  _X!.XFlush(_display);

  const ev = await waitForSelectionNotify(2000);
  if (!ev) return false;
  if (ev.getBigUint64(56, true) === 0n) return false;

  const data = readProperty(_window, _MECHATRON_SEL);
  if (!data) return false;

  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i + 3 < data.length; i += longSize) {
    if (BigInt(dv.getUint32(i, true)) === target) return true;
  }
  return false;
}

// ── Operation handlers ────────────────────────────────────────────────

function opClear(): boolean {
  if (!ensure()) return false;
  if (_weOwnClipboard) {
    _X!.XSetSelectionOwner(_display, _CLIPBOARD, 0n, 0n);
    _weOwnClipboard = false;
    _clipSeq++;
  }
  _clipText = null;
  _clipPng = null;
  _X!.XFlush(_display);
  return true;
}

async function opHasText(): Promise<boolean> {
  if (!ensure()) return false;
  if (_weOwnClipboard) return _clipText !== null && _clipText.length > 0;
  return await hasTarget(_UTF8_STRING);
}

async function opGetText(): Promise<string> {
  if (!ensure()) return "";
  if (_weOwnClipboard) return _clipText ?? "";

  _X!.XDeleteProperty(_display, _window, _MECHATRON_SEL);
  _X!.XConvertSelection(_display, _CLIPBOARD, _UTF8_STRING, _MECHATRON_SEL, _window, 0n);
  _X!.XFlush(_display);

  const ev = await waitForSelectionNotify(2000);
  if (!ev) return "";
  if (ev.getBigUint64(56, true) === 0n) return "";

  const data = readProperty(_window, _MECHATRON_SEL);
  if (!data) return "";
  return new TextDecoder().decode(data);
}

function opSetText(text: string): boolean {
  if (!ensure()) return false;
  _clipText = text;
  _clipPng = null;
  _X!.XSetSelectionOwner(_display, _CLIPBOARD, _window, 0n);
  _X!.XFlush(_display);
  _weOwnClipboard = _X!.XGetSelectionOwner(_display, _CLIPBOARD) === _window;
  if (_weOwnClipboard) _clipSeq++;
  return _weOwnClipboard;
}

async function opHasImage(): Promise<boolean> {
  if (!ensure()) return false;
  if (_weOwnClipboard) return _clipPng !== null;
  return await hasTarget(_IMAGE_PNG);
}

async function opGetImage(): Promise<{ width: number; height: number; data: Uint32Array } | null> {
  if (!ensure()) return null;

  let pngData: Uint8Array | null = null;
  if (_weOwnClipboard) {
    if (!_clipPng) return null;
    pngData = _clipPng;
  } else {
    _X!.XDeleteProperty(_display, _window, _MECHATRON_SEL);
    _X!.XConvertSelection(_display, _CLIPBOARD, _IMAGE_PNG, _MECHATRON_SEL, _window, 0n);
    _X!.XFlush(_display);

    const ev = await waitForSelectionNotify(2000);
    if (!ev) return null;
    if (ev.getBigUint64(56, true) === 0n) return null;

    pngData = readProperty(_window, _MECHATRON_SEL);
    if (!pngData) return null;
  }

  try {
    // @ts-ignore
    const { PNG } = require("pngjs");
    const png = PNG.sync.read(Buffer.from(pngData));
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

function opSetImage(w: number, h: number, d: Uint32Array): boolean {
  if (!ensure()) return false;
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
    _clipText = null;

    _X!.XSetSelectionOwner(_display, _CLIPBOARD, _window, 0n);
    _X!.XFlush(_display);
    _weOwnClipboard = _X!.XGetSelectionOwner(_display, _CLIPBOARD) === _window;
    if (_weOwnClipboard) _clipSeq++;
    return _weOwnClipboard;
  } catch {
    return false;
  }
}

function opSequence(): number {
  ensure();
  return _clipSeq;
}

// ── Message dispatch ──────────────────────────────────────────────────

if (!parentPort) throw new Error("clipboard-worker must run as a worker_thread");

parentPort.on("message", async (data: any) => {
  const { id, op, args } = data;
  let result: any = null;
  try {
    switch (op) {
      case "clear":    result = opClear(); break;
      case "hasText":  result = await opHasText(); break;
      case "getText":  result = await opGetText(); break;
      case "setText":  result = opSetText(args.text); break;
      case "hasImage": result = await opHasImage(); break;
      case "getImage": result = await opGetImage(); break;
      case "setImage": result = opSetImage(args.width, args.height, args.data); break;
      case "sequence": result = opSequence(); break;
    }
  } catch {
    result = null;
  }
  parentPort!.postMessage({ id, result });
});
