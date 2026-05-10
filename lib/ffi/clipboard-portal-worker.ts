/**
 * ffi[portal] clipboard worker — Wayland data_device / zwlr_data_control
 * protocol implementation via bun:ffi + libwayland-client.
 *
 * Mirrors napi[portal]'s clipboard_wl.rs: a dedicated worker thread with
 * its own Wayland display connection, event loop, and clipboard state.
 * Supports dual protocols: zwlr_data_control_v1 (wlroots) with fallback
 * to core wl_data_device (GNOME/Mutter).
 */

import * as net from "net";
import { parentPort } from "worker_threads";
import { getBunFFI, bp, cstr, cstringFromPtr } from "./bun";
import { loadWayland, wlArgs, WlProto, WL_MARSHAL_FLAG_DESTROY, type WlFuncs } from "./wayland";
import { argbToPng, pngToArgb } from "./clipboard-png";

if (!parentPort) throw new Error("clipboard-portal-worker must run as a worker_thread");

const F = getBunFFI()!;
const T = F.FFIType;
const wl = loadWayland()!;

interface SysC {
  pipe: (pipefd: bigint) => number;
  write: (fd: number, buf: bigint, count: bigint) => bigint;
  close: (fd: number) => number;
  read: (fd: number, buf: bigint, count: bigint) => bigint;
}

const lc = F.dlopen<SysC>("libc.so.6", {
  pipe:  { args: [T.i64], returns: T.i32 },
  write: { args: [T.i32, T.i64, T.u64], returns: T.i64 },
  close: { args: [T.i32], returns: T.i32 },
  read:  { args: [T.i32, T.i64, T.u64], returns: T.i64 },
}).symbols;

// ── Protocol definitions (mirrors napi/src/clipboard_wl.rs) ──────────

const P = new WlProto();
const nt = P.types([null, null, null, null, null]);

const WL_SEAT = P.iface("wl_seat", 7, [], []);
const XDG_TOPLEVEL = P.iface("xdg_toplevel", 2, [], []);

const WL_SURFACE = P.iface("wl_surface", 4, [
  { name: "destroy",           sig: "",     types: nt },
  { name: "attach",            sig: "?oii", types: nt },
  { name: "damage",            sig: "iiii", types: nt },
  { name: "frame",             sig: "n",    types: nt },
  { name: "set_opaque_region", sig: "?o",   types: nt },
  { name: "set_input_region",  sig: "?o",   types: nt },
  { name: "commit",            sig: "",     types: nt },
], []);

const WL_DATA_OFFER = P.iface("wl_data_offer", 3, [
  { name: "accept",  sig: "u?s", types: nt },
  { name: "receive", sig: "sh",  types: nt },
  { name: "destroy", sig: "",    types: nt },
], [
  { name: "offer", sig: "s", types: nt },
]);

const WL_DATA_SOURCE = P.iface("wl_data_source", 3, [
  { name: "offer",   sig: "s", types: nt },
  { name: "destroy", sig: "",  types: nt },
], [
  { name: "target",    sig: "?s", types: nt },
  { name: "send",      sig: "sh", types: nt },
  { name: "cancelled", sig: "",   types: nt },
]);

const ZWLR_OFFER = P.iface("zwlr_data_control_offer_v1", 1, [
  { name: "receive", sig: "sh", types: nt },
  { name: "destroy", sig: "",   types: nt },
], [
  { name: "offer", sig: "s", types: nt },
]);

const ZWLR_SOURCE = P.iface("zwlr_data_control_source_v1", 1, [
  { name: "offer",   sig: "s", types: nt },
  { name: "destroy", sig: "",  types: nt },
], [
  { name: "send",      sig: "sh", types: nt },
  { name: "cancelled", sig: "",   types: nt },
]);

const XDG_SURFACE = P.iface("xdg_surface", 2, [
  { name: "destroy",             sig: "",    types: nt },
  { name: "get_toplevel",        sig: "n",   types: P.types([XDG_TOPLEVEL]) },
  { name: "get_popup",           sig: "noo", types: nt },
  { name: "set_window_geometry", sig: "iiii", types: nt },
  { name: "ack_configure",       sig: "u",   types: nt },
], [
  { name: "configure", sig: "u", types: nt },
]);

const WL_DATA_DEVICE = P.iface("wl_data_device", 3, [
  { name: "start_drag",    sig: "?oo?ou", types: P.types([WL_DATA_SOURCE, WL_SURFACE, WL_SURFACE, null]) },
  { name: "set_selection", sig: "?ou",    types: P.types([WL_DATA_SOURCE, null]) },
  { name: "release",       sig: "",       types: nt },
], [
  { name: "data_offer", sig: "n",      types: P.types([WL_DATA_OFFER]) },
  { name: "enter",      sig: "uoff?o", types: P.types([null, WL_SURFACE, null, null, WL_DATA_OFFER]) },
  { name: "leave",      sig: "",       types: nt },
  { name: "motion",     sig: "uff",    types: nt },
  { name: "drop",       sig: "",       types: nt },
  { name: "selection",  sig: "?o",     types: P.types([WL_DATA_OFFER]) },
]);

const WL_COMPOSITOR = P.iface("wl_compositor", 4, [
  { name: "create_surface", sig: "n", types: P.types([WL_SURFACE]) },
  { name: "create_region",  sig: "n", types: nt },
], []);

const WL_DDM = P.iface("wl_data_device_manager", 3, [
  { name: "create_data_source", sig: "n",  types: P.types([WL_DATA_SOURCE]) },
  { name: "get_data_device",    sig: "no", types: P.types([WL_DATA_DEVICE, WL_SEAT]) },
], []);

const ZWLR_DEVICE = P.iface("zwlr_data_control_device_v1", 2, [
  { name: "set_selection",         sig: "?o", types: P.types([ZWLR_SOURCE]) },
  { name: "destroy",               sig: "",   types: nt },
  { name: "set_primary_selection", sig: "?o", types: P.types([ZWLR_SOURCE]) },
], [
  { name: "data_offer",        sig: "n",  types: P.types([ZWLR_OFFER]) },
  { name: "selection",         sig: "?o", types: P.types([ZWLR_OFFER]) },
  { name: "finished",          sig: "",   types: nt },
  { name: "primary_selection", sig: "?o", types: P.types([ZWLR_OFFER]) },
]);

const ZWLR_MANAGER = P.iface("zwlr_data_control_manager_v1", 2, [
  { name: "create_data_source", sig: "n",  types: P.types([ZWLR_SOURCE]) },
  { name: "get_data_device",    sig: "no", types: P.types([ZWLR_DEVICE, WL_SEAT]) },
  { name: "destroy",            sig: "",   types: nt },
], []);

const XDG_WM_BASE = P.iface("xdg_wm_base", 2, [
  { name: "destroy",           sig: "",   types: nt },
  { name: "create_positioner", sig: "n",  types: nt },
  { name: "get_xdg_surface",   sig: "no", types: P.types([XDG_SURFACE, WL_SURFACE]) },
  { name: "pong",              sig: "u",  types: nt },
], [
  { name: "ping", sig: "u", types: nt },
]);

const WL_REGISTRY = P.iface("wl_registry", 1, [
  { name: "bind", sig: "usun", types: nt },
], [
  { name: "global",        sig: "usu", types: nt },
  { name: "global_remove", sig: "u",   types: nt },
]);

// ── State ────────────────────────────────────────────────────────────

type BackendKind = "zwlr" | "core";

let display = 0n;
let _seat = 0n;
let _zwlrManager = 0n;
let _compositor = 0n;
let _ddm = 0n;
let _xdgWmBase = 0n;
let _kind: BackendKind = "zwlr";
let _zwlrDevice = 0n;
let _coreDataDevice = 0n;
let _surface = 0n;
let _xdgSurface = 0n;
let _xdgToplevel = 0n;
let _curOffer = 0n;
let _curOfferMimes: string[] = [];
let _clipText: string | null = null;
let _clipPng: Uint8Array | null = null;
let _source = 0n;
let _sequence = 0;
let _owns = false;

// ── Helpers ──────────────────────────────────────────────────────────

function toBig(v: any): bigint {
  return typeof v === "bigint" ? v : BigInt(v ?? 0);
}

function toNum(v: any): number {
  return typeof v === "bigint" ? Number(v) : (v as number);
}

function marshal(proxy: bigint, opcode: number, iface: bigint, version: number, flags: number, ...args: (number | bigint)[]): bigint {
  if (args.length === 0) {
    return wl.marshalArray(proxy, opcode, iface, version, flags, 0n);
  }
  const a = wlArgs(...args);
  return wl.marshalArray(proxy, opcode, iface, version, flags, bp(a));
}

function destroyProxyOpcode(proxy: bigint, opcode: number): void {
  marshal(proxy, opcode, 0n, 0, WL_MARSHAL_FLAG_DESTROY);
}

function destroyCurOffer(): void {
  if (!_curOffer) return;
  if (_kind === "zwlr") destroyProxyOpcode(_curOffer, 1);
  else wl.destroy(_curOffer);
  _curOffer = 0n;
}

function destroySourceObj(): void {
  if (!_source) return;
  destroyProxyOpcode(_source, 1);
  _source = 0n;
}

function writeAllFd(fd: number, data: Uint8Array): void {
  let written = 0;
  const ptr = bp(data);
  while (written < data.length) {
    const n = Number(lc.write(fd, ptr + BigInt(written), BigInt(data.length - written)));
    if (n <= 0) break;
    written += n;
  }
}

function setSelectionNull(): void {
  if (_kind === "zwlr") {
    marshal(_zwlrDevice, 0, 0n, wl.getVersion(_zwlrDevice), 0, 0n);
  } else {
    marshal(_coreDataDevice, 1, 0n, wl.getVersion(_coreDataDevice), 0, 0n, 0);
  }
}

// ── Callbacks ────────────────────────────────────────────────────────

const cbOfferOffer = new F.JSCallback(
  (_data: any, _offer: any, mimePtr: any) => {
    const p = toBig(mimePtr);
    if (p) _curOfferMimes.push(cstringFromPtr(p));
  },
  { args: [T.i64, T.i64, T.i64] },
);
const offerListener = P.listener([cbOfferOffer]);

const cbSourceSend = new F.JSCallback(
  (_data: any, _source: any, mimePtr: any, fd: any) => {
    const p = toBig(mimePtr);
    const fdNum = toNum(fd);
    if (p) {
      const mime = cstringFromPtr(p);
      if ((mime === "text/plain" || mime === "text/plain;charset=utf-8"
        || mime === "UTF8_STRING" || mime === "STRING") && _clipText) {
        writeAllFd(fdNum, new TextEncoder().encode(_clipText));
      } else if (mime === "image/png" && _clipPng) {
        writeAllFd(fdNum, _clipPng);
      }
    }
    lc.close(fdNum);
  },
  { args: [T.i64, T.i64, T.i64, T.i32] },
);

const cbSourceCancelled = new F.JSCallback(
  () => {
    _owns = false;
    if (_source) { destroyProxyOpcode(_source, 1); _source = 0n; }
  },
  { args: [T.i64, T.i64] },
);

const cbSourceTarget = new F.JSCallback(() => {}, { args: [T.i64, T.i64, T.i64] });

const zwlrSourceListener = P.listener([cbSourceSend, cbSourceCancelled]);
const coreSourceListener = P.listener([cbSourceTarget, cbSourceSend, cbSourceCancelled]);

const cbZwlrDataOffer = new F.JSCallback(
  (_data: any, _device: any, offer: any) => {
    const o = toBig(offer);
    if (o) wl.addListener(o, offerListener, 0n);
  },
  { args: [T.i64, T.i64, T.i64] },
);

const cbZwlrSelection = new F.JSCallback(
  (_data: any, _device: any, offer: any) => {
    destroyCurOffer();
    _curOfferMimes = [];
    _curOffer = toBig(offer);
  },
  { args: [T.i64, T.i64, T.i64] },
);

const cbNoOp2 = new F.JSCallback(() => {}, { args: [T.i64, T.i64] });
const cbNoOp3 = new F.JSCallback(() => {}, { args: [T.i64, T.i64, T.i64] });

const zwlrDeviceListener = P.listener([cbZwlrDataOffer, cbZwlrSelection, cbNoOp2, cbNoOp3]);

const cbCoreDeviceDataOffer = new F.JSCallback(
  (_data: any, _device: any, offer: any) => {
    const o = toBig(offer);
    if (o) wl.addListener(o, offerListener, 0n);
  },
  { args: [T.i64, T.i64, T.i64] },
);

const cbCoreDeviceSelection = new F.JSCallback(
  (_data: any, _device: any, offer: any) => {
    destroyCurOffer();
    _curOfferMimes = [];
    _curOffer = toBig(offer);
  },
  { args: [T.i64, T.i64, T.i64] },
);

const cbCoreDeviceEnter = new F.JSCallback(() => {}, { args: [T.i64, T.i64, T.u32, T.i64, T.i32, T.i32, T.i64] });
const cbCoreDeviceLeave = new F.JSCallback(() => {}, { args: [T.i64, T.i64] });
const cbCoreDeviceMotion = new F.JSCallback(() => {}, { args: [T.i64, T.i64, T.u32, T.i32, T.i32] });
const cbCoreDeviceDrop = new F.JSCallback(() => {}, { args: [T.i64, T.i64] });

const coreDataDeviceListener = P.listener([
  cbCoreDeviceDataOffer, cbCoreDeviceEnter, cbCoreDeviceLeave,
  cbCoreDeviceMotion, cbCoreDeviceDrop, cbCoreDeviceSelection,
]);

const cbXdgPing = new F.JSCallback(
  (_data: any, wmBase: any, serial: any) => {
    const wb = toBig(wmBase);
    if (wb) marshal(wb, 3, 0n, wl.getVersion(wb), 0, toNum(serial));
  },
  { args: [T.i64, T.i64, T.u32] },
);

const cbXdgConfigure = new F.JSCallback(
  (_data: any, xs: any, serial: any) => {
    const xsBig = toBig(xs);
    if (xsBig) marshal(xsBig, 4, 0n, wl.getVersion(xsBig), 0, toNum(serial));
  },
  { args: [T.i64, T.i64, T.u32] },
);

const xdgWmBaseListener = P.listener([cbXdgPing]);
const xdgSurfaceListenerStruct = P.listener([cbXdgConfigure]);

const cbRegistryGlobal = new F.JSCallback(
  (_data: any, registry: any, name: any, ifacePtr: any, version: any) => {
    const reg = toBig(registry);
    const nameVal = toNum(name);
    const iPtr = toBig(ifacePtr);
    const ver = toNum(version);
    const ifaceName = cstringFromPtr(iPtr);

    function bind(targetIface: bigint, maxVer: number): bigint {
      const useVer = Math.min(ver, maxVer);
      const a = wlArgs(nameVal, iPtr, useVer, 0);
      return wl.marshalArray(reg, 0, targetIface, useVer, 0, bp(a));
    }

    if (ifaceName === "wl_seat" && !_seat) {
      _seat = bind(WL_SEAT, 7);
    } else if (ifaceName === "zwlr_data_control_manager_v1" && !_zwlrManager) {
      _zwlrManager = bind(ZWLR_MANAGER, 2);
    } else if (ifaceName === "wl_compositor" && !_compositor) {
      _compositor = bind(WL_COMPOSITOR, 4);
    } else if (ifaceName === "wl_data_device_manager" && !_ddm) {
      _ddm = bind(WL_DDM, 3);
    } else if (ifaceName === "xdg_wm_base" && !_xdgWmBase) {
      _xdgWmBase = bind(XDG_WM_BASE, 2);
    }
  },
  { args: [T.i64, T.i64, T.u32, T.i64, T.u32] },
);

const cbRegistryGlobalRemove = new F.JSCallback(() => {}, { args: [T.i64, T.i64, T.u32] });
const registryListener = P.listener([cbRegistryGlobal, cbRegistryGlobalRemove]);

// ── Initialization ───────────────────────────────────────────────────

function initZwlrBackend(): boolean {
  _kind = "zwlr";
  const device = marshal(_zwlrManager, 1, ZWLR_DEVICE, wl.getVersion(_zwlrManager), 0, 0n, _seat);
  if (!device) return false;
  _zwlrDevice = device;
  wl.addListener(device, zwlrDeviceListener, 0n);
  wl.roundtrip(display);
  return true;
}

function initCoreBackend(): boolean {
  _kind = "core";
  if (!_compositor || !_xdgWmBase) return false;

  wl.addListener(_xdgWmBase, xdgWmBaseListener, 0n);

  const dd = marshal(_ddm, 1, WL_DATA_DEVICE, wl.getVersion(_ddm), 0, 0n, _seat);
  if (!dd) return false;
  _coreDataDevice = dd;
  wl.addListener(dd, coreDataDeviceListener, 0n);

  const surf = marshal(_compositor, 0, WL_SURFACE, wl.getVersion(_compositor), 0, 0n);
  if (!surf) return false;
  _surface = surf;

  const xs = marshal(_xdgWmBase, 2, XDG_SURFACE, wl.getVersion(_xdgWmBase), 0, 0n, _surface);
  if (!xs) return false;
  _xdgSurface = xs;
  wl.addListener(xs, xdgSurfaceListenerStruct, 0n);

  const tl = marshal(_xdgSurface, 1, XDG_TOPLEVEL, wl.getVersion(_xdgSurface), 0, 0n);
  if (!tl) return false;
  _xdgToplevel = tl;

  marshal(_surface, 6, 0n, wl.getVersion(_surface), 0);
  wl.roundtrip(display);
  marshal(_surface, 6, 0n, wl.getVersion(_surface), 0);
  wl.roundtrip(display);
  return true;
}

function init(): boolean {
  display = wl.connect(0n);
  if (!display) return false;

  const version = wl.getVersion(display);
  const registry = marshal(display, 1, WL_REGISTRY, version, 0, 0n);
  if (!registry) {
    wl.disconnect(display); display = 0n;
    return false;
  }

  wl.addListener(registry, registryListener, 0n);
  wl.roundtrip(display);

  if (!_seat) {
    wl.destroy(registry); wl.disconnect(display); display = 0n;
    return false;
  }

  let ok = false;
  if (_zwlrManager) {
    ok = initZwlrBackend();
  } else if (_ddm) {
    ok = initCoreBackend();
  }

  if (!ok) {
    wl.destroy(registry); wl.disconnect(display); display = 0n;
    return false;
  }

  wl.roundtrip(display);

  const fd = wl.getFd(display);
  const sock = new net.Socket({ fd, readable: true, writable: false });
  sock.pause();
  sock.on("readable", () => { wl.dispatch(display); sock.read(0); });
  sock.on("error", () => {});

  return true;
}

// ── Clipboard operations ─────────────────────────────────────────────

const TEXT_MIMES = ["text/plain;charset=utf-8", "text/plain", "UTF8_STRING", "STRING"];

function receiveMime(mime: string): Uint8Array | null {
  if (!_curOffer || !_curOfferMimes.includes(mime)) return null;

  const pipeFds = new Int32Array(2);
  if (lc.pipe(bp(pipeFds)) !== 0) return null;
  const pipeRd = pipeFds[0];
  const pipeWr = pipeFds[1];

  const c = cstr(mime);
  const receiveOpcode = _kind === "zwlr" ? 0 : 1;
  marshal(_curOffer, receiveOpcode, 0n, wl.getVersion(_curOffer), 0, bp(c), pipeWr);

  lc.close(pipeWr);
  wl.roundtrip(display);

  const chunks: Uint8Array[] = [];
  const buf = new Uint8Array(65536);
  const bufPtr = bp(buf);
  for (;;) {
    const n = Number(lc.read(pipeRd, bufPtr, BigInt(buf.length)));
    if (n <= 0) break;
    chunks.push(buf.slice(0, n));
  }
  lc.close(pipeRd);

  if (chunks.length === 0) return null;
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { result.set(c, off); off += c.length; }
  return result;
}

function createAndSetSource(mimes: string[]): boolean {
  return _kind === "zwlr"
    ? createAndSetSourceZwlr(mimes)
    : createAndSetSourceCore(mimes);
}

function createAndSetSourceZwlr(mimes: string[]): boolean {
  const src = marshal(_zwlrManager, 0, ZWLR_SOURCE, wl.getVersion(_zwlrManager), 0, 0n);
  if (!src) return false;
  wl.addListener(src, zwlrSourceListener, 0n);

  for (const mime of mimes) {
    const c = cstr(mime);
    marshal(src, 0, 0n, wl.getVersion(src), 0, bp(c));
  }
  _source = src;
  marshal(_zwlrDevice, 0, 0n, wl.getVersion(_zwlrDevice), 0, src);
  wl.roundtrip(display);
  return true;
}

function createAndSetSourceCore(mimes: string[]): boolean {
  const src = marshal(_ddm, 0, WL_DATA_SOURCE, wl.getVersion(_ddm), 0, 0n);
  if (!src) return false;
  wl.addListener(src, coreSourceListener, 0n);

  for (const mime of mimes) {
    const c = cstr(mime);
    marshal(src, 0, 0n, wl.getVersion(src), 0, bp(c));
  }
  _source = src;
  marshal(_coreDataDevice, 1, 0n, wl.getVersion(_coreDataDevice), 0, src, 0);
  wl.roundtrip(display);
  return true;
}

function opClear(): boolean {
  if (!display) return false;
  destroySourceObj();
  _clipText = null;
  _clipPng = null;
  _owns = false;
  setSelectionNull();
  wl.roundtrip(display);
  _sequence++;
  return true;
}

function opHasText(): boolean {
  if (!display) return false;
  if (_owns && _clipText !== null) return true;
  wl.roundtrip(display);
  return _curOfferMimes.some(m => TEXT_MIMES.includes(m));
}

function opGetText(): string {
  if (!display) return "";
  if (_owns) return _clipText ?? "";
  wl.roundtrip(display);
  if (!_curOffer) return "";
  for (const mime of ["text/plain;charset=utf-8", "text/plain", "UTF8_STRING"]) {
    const data = receiveMime(mime);
    if (data) return new TextDecoder().decode(data);
  }
  return "";
}

function opSetText(text: string): boolean {
  if (!display) return false;
  destroySourceObj();
  _clipText = text;
  _clipPng = null;
  const ok = createAndSetSource(TEXT_MIMES);
  if (ok) { _owns = true; _sequence++; }
  return ok;
}

function opHasImage(): boolean {
  if (!display) return false;
  if (_owns && _clipPng !== null) return true;
  wl.roundtrip(display);
  return _curOfferMimes.includes("image/png");
}

function opGetImage(): { width: number; height: number; data: Uint32Array } | null {
  if (!display) return null;
  if (_owns) {
    return _clipPng ? pngToArgb(_clipPng) : null;
  }
  wl.roundtrip(display);
  if (!_curOffer) return null;
  const data = receiveMime("image/png");
  return data ? pngToArgb(data) : null;
}

function opSetImage(w: number, h: number, d: Uint32Array): boolean {
  if (!display) return false;
  destroySourceObj();
  const pngBytes = argbToPng(w, h, d);
  if (!pngBytes) return false;
  _clipPng = pngBytes;
  _clipText = null;
  const ok = createAndSetSource(["image/png"]);
  if (ok) { _owns = true; _sequence++; }
  return ok;
}

function opSequence(): number {
  return _sequence;
}

// ── Worker startup and message dispatch ──────────────────────────────

const _initialized = init();

parentPort.on("message", async (data: any) => {
  const { id, op, args } = data;
  let result: any = null;
  if (_initialized) {
    try {
      switch (op) {
        case "clear":    result = opClear(); break;
        case "hasText":  result = opHasText(); break;
        case "getText":  result = opGetText(); break;
        case "setText":  result = opSetText(args.text); break;
        case "hasImage": result = opHasImage(); break;
        case "getImage": result = opGetImage(); break;
        case "setImage": result = opSetImage(args.width, args.height, args.data); break;
        case "sequence": result = opSequence(); break;
      }
    } catch { /* swallow — return null */ }
  }
  parentPort!.postMessage({ id, result });
});
