/**
 * ffi[portal] screen implementation — PipeWire capture via bun:ffi.
 *
 * Mirrors napi/src/{pw.rs, pw_capture.rs, screencast.rs}: dlopens
 * libpipewire-0.3.so.0, sets up a PW stream, and grabs single frames
 * through the ScreenCast portal.  Runs in a worker thread.
 */

import { getBunFFI, bp, cstr, type BunFFI } from "./bun";
import { portalGetScreencastSession, type ScreencastSession } from "./portal-fd";
import { libc as getLibc, libcFFI } from "./libc";

const F = getBunFFI()!;
const T = F.FFIType;

// ── SPA / PipeWire constants (mirrors napi/src/pw.rs) ───────────────

const SPA_TYPE_Id = 3;
const SPA_TYPE_Object = 15;
const SPA_TYPE_Choice = 19;
const SPA_TYPE_OBJECT_Format = 0x40003;
const SPA_PARAM_Format = 2;
const SPA_PARAM_EnumFormat = 3;
const SPA_FORMAT_mediaType = 1;
const SPA_FORMAT_mediaSubtype = 2;
const SPA_FORMAT_VIDEO_format = 0x20001;
const SPA_FORMAT_VIDEO_framerate = 0x20004;
const SPA_MEDIA_TYPE_video = 2;
const SPA_MEDIA_SUBTYPE_raw = 1;
const SPA_VIDEO_FORMAT_RGBx = 7;
const SPA_VIDEO_FORMAT_BGRx = 8;
const SPA_VIDEO_FORMAT_xRGB = 9;
const SPA_VIDEO_FORMAT_xBGR = 10;
const SPA_VIDEO_FORMAT_RGBA = 11;
const SPA_VIDEO_FORMAT_BGRA = 12;
const SPA_VIDEO_FORMAT_ARGB = 13;
const SPA_CHOICE_Enum = 3;
const PW_DIRECTION_INPUT = 0;
const PW_STREAM_STATE_ERROR = -1;
const PW_STREAM_FLAG_AUTOCONNECT = 1;
const PW_STREAM_FLAG_MAP_BUFFERS = 4;
const PW_VERSION_STREAM_EVENTS = 2;

// ── PipeWire dlopen ─────────────────────────────────────────────────

interface PwSymbols {
  pw_init: (a: bigint, b: bigint) => void;
  pw_main_loop_new: (props: bigint) => bigint;
  pw_main_loop_destroy: (loop: bigint) => void;
  pw_main_loop_get_loop: (loop: bigint) => bigint;
  pw_main_loop_run: (loop: bigint) => number;
  pw_main_loop_quit: (loop: bigint) => number;
  pw_context_new: (loop: bigint, props: bigint, sz: number) => bigint;
  pw_context_destroy: (ctx: bigint) => void;
  pw_context_connect_fd: (ctx: bigint, fd: number, props: bigint, sz: number) => bigint;
  pw_core_disconnect: (core: bigint) => void;
  pw_stream_new: (core: bigint, name: bigint, props: bigint) => bigint;
  pw_stream_destroy: (stream: bigint) => void;
  pw_stream_connect: (stream: bigint, dir: number, target: number, flags: number, params: bigint, nParams: number) => number;
  pw_stream_add_listener: (stream: bigint, hook: bigint, events: bigint, data: bigint) => void;
  pw_stream_dequeue_buffer: (stream: bigint) => bigint;
  pw_stream_queue_buffer: (stream: bigint, buf: bigint) => number;
}

let pw: PwSymbols | null = null;

function loadPw(): PwSymbols | null {
  if (pw) return pw;
  let h: ReturnType<BunFFI["dlopen"]>;
  try {
    h = F.dlopen("libpipewire-0.3.so.0", {
      pw_init:                 { args: [T.i64, T.i64], returns: T.void },
      pw_main_loop_new:        { args: [T.i64], returns: T.i64 },
      pw_main_loop_destroy:    { args: [T.i64], returns: T.void },
      pw_main_loop_get_loop:   { args: [T.i64], returns: T.i64 },
      pw_main_loop_run:        { args: [T.i64], returns: T.i32 },
      pw_main_loop_quit:       { args: [T.i64], returns: T.i32 },
      pw_context_new:          { args: [T.i64, T.i64, T.u64], returns: T.i64 },
      pw_context_destroy:      { args: [T.i64], returns: T.void },
      pw_context_connect_fd:   { args: [T.i64, T.i32, T.i64, T.u64], returns: T.i64 },
      pw_core_disconnect:      { args: [T.i64], returns: T.void },
      pw_stream_new:           { args: [T.i64, T.i64, T.i64], returns: T.i64 },
      pw_stream_destroy:       { args: [T.i64], returns: T.void },
      pw_stream_connect:       { args: [T.i64, T.u32, T.u32, T.u32, T.i64, T.u32], returns: T.i32 },
      pw_stream_add_listener:  { args: [T.i64, T.i64, T.i64, T.i64], returns: T.void },
      pw_stream_dequeue_buffer:{ args: [T.i64], returns: T.i64 },
      pw_stream_queue_buffer:  { args: [T.i64, T.i64], returns: T.i32 },
    });
  } catch {
    try {
      h = F.dlopen("libpipewire-0.3.so", {
        pw_init:                 { args: [T.i64, T.i64], returns: T.void },
        pw_main_loop_new:        { args: [T.i64], returns: T.i64 },
        pw_main_loop_destroy:    { args: [T.i64], returns: T.void },
        pw_main_loop_get_loop:   { args: [T.i64], returns: T.i64 },
        pw_main_loop_run:        { args: [T.i64], returns: T.i32 },
        pw_main_loop_quit:       { args: [T.i64], returns: T.i32 },
        pw_context_new:          { args: [T.i64, T.i64, T.u64], returns: T.i64 },
        pw_context_destroy:      { args: [T.i64], returns: T.void },
        pw_context_connect_fd:   { args: [T.i64, T.i32, T.i64, T.u64], returns: T.i64 },
        pw_core_disconnect:      { args: [T.i64], returns: T.void },
        pw_stream_new:           { args: [T.i64, T.i64, T.i64], returns: T.i64 },
        pw_stream_destroy:       { args: [T.i64], returns: T.void },
        pw_stream_connect:       { args: [T.i64, T.u32, T.u32, T.u32, T.i64, T.u32], returns: T.i32 },
        pw_stream_add_listener:  { args: [T.i64, T.i64, T.i64, T.i64], returns: T.void },
        pw_stream_dequeue_buffer:{ args: [T.i64], returns: T.i64 },
        pw_stream_queue_buffer:  { args: [T.i64, T.i64], returns: T.i32 },
      });
    } catch { return null; }
  }
  pw = h.symbols as unknown as PwSymbols;
  pw.pw_init(0n, 0n);
  return pw;
}

// ── libc extras ─────────────────────────────────────────────────────

interface Lc2 {
  dup: (fd: number) => number;
  close: (fd: number) => number;
}

const lc2 = F.dlopen<Lc2>("libc.so.6", {
  dup:   { args: [T.i32], returns: T.i32 },
  close: { args: [T.i32], returns: T.i32 },
}).symbols;

// ── SPA pod construction (mirrors napi/src/pw.rs) ───────────────────

function pushU32(buf: number[], v: number): void {
  buf.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF);
}

function podHeader(buf: number[], size: number, type: number): void {
  pushU32(buf, size);
  pushU32(buf, type);
}

function podId(buf: number[], val: number): void {
  podHeader(buf, 4, SPA_TYPE_Id);
  pushU32(buf, val);
}

function podProp(buf: number[], key: number, flags: number): void {
  pushU32(buf, key);
  pushU32(buf, flags);
}

function podFraction(buf: number[], num: number, denom: number): void {
  podHeader(buf, 8, 11);
  pushU32(buf, num);
  pushU32(buf, denom);
}

function buildVideoFormatPod(): Uint8Array {
  const body: number[] = [];
  pushU32(body, SPA_TYPE_OBJECT_Format);
  pushU32(body, SPA_PARAM_EnumFormat);

  podProp(body, SPA_FORMAT_mediaType, 0);
  podId(body, SPA_MEDIA_TYPE_video);

  podProp(body, SPA_FORMAT_mediaSubtype, 0);
  podId(body, SPA_MEDIA_SUBTYPE_raw);

  podProp(body, SPA_FORMAT_VIDEO_format, 0);
  const formats = [
    SPA_VIDEO_FORMAT_BGRx, SPA_VIDEO_FORMAT_BGRA,
    SPA_VIDEO_FORMAT_RGBx, SPA_VIDEO_FORMAT_RGBA,
    SPA_VIDEO_FORMAT_xRGB, SPA_VIDEO_FORMAT_ARGB,
  ];
  const choiceBody: number[] = [];
  pushU32(choiceBody, SPA_CHOICE_Enum);
  pushU32(choiceBody, 0);
  for (const fmt of formats) podId(choiceBody, fmt);
  podHeader(body, choiceBody.length, SPA_TYPE_Choice);
  body.push(...choiceBody);

  podProp(body, SPA_FORMAT_VIDEO_framerate, 0);
  podFraction(body, 0, 1);

  const pod: number[] = [];
  podHeader(pod, body.length, SPA_TYPE_Object);
  pod.push(...body);
  return new Uint8Array(pod);
}

// ── Format conversion (mirrors napi/src/pw_capture.rs) ──────────────

function convertToArgb(src: Uint32Array, w: number, h: number, fmt: number): Uint32Array {
  const len = w * h;
  const out = new Uint32Array(len);
  switch (fmt) {
    case SPA_VIDEO_FORMAT_BGRx:
      for (let i = 0; i < len; i++) out[i] = src[i] | 0xFF000000;
      return out;
    case SPA_VIDEO_FORMAT_BGRA:
      out.set(src.subarray(0, len));
      return out;
    case SPA_VIDEO_FORMAT_ARGB:
      for (let i = 0; i < len; i++) {
        const p = src[i];
        out[i] = ((p & 0xFF) << 24) | ((p >> 8) & 0xFF) << 16 | ((p >> 16) & 0xFF) << 8 | ((p >> 24) & 0xFF);
      }
      return out;
    case SPA_VIDEO_FORMAT_RGBx:
    case SPA_VIDEO_FORMAT_RGBA: {
      const hasAlpha = fmt === SPA_VIDEO_FORMAT_RGBA;
      for (let i = 0; i < len; i++) {
        const p = src[i];
        const r = p & 0xFF, g = (p >> 8) & 0xFF, b = (p >> 16) & 0xFF;
        const a = hasAlpha ? (p >> 24) & 0xFF : 0xFF;
        out[i] = (a << 24) | (r << 16) | (g << 8) | b;
      }
      return out;
    }
    case SPA_VIDEO_FORMAT_xRGB:
      for (let i = 0; i < len; i++) {
        const p = src[i];
        out[i] = 0xFF000000 | ((p >> 8) & 0xFF) << 16 | ((p >> 16) & 0xFF) << 8 | ((p >> 24) & 0xFF);
      }
      return out;
    case SPA_VIDEO_FORMAT_xBGR:
      for (let i = 0; i < len; i++) {
        const p = src[i];
        out[i] = 0xFF000000 | ((p >> 24) & 0xFF) << 16 | ((p >> 16) & 0xFF) << 8 | ((p >> 8) & 0xFF);
      }
      return out;
    default:
      for (let i = 0; i < len; i++) out[i] = src[i] | 0xFF000000;
      return out;
  }
}

// ── Frame grab (mirrors napi/src/pw_capture.rs) ─────────────────────

function pwGrabFrame(pwFd: number, nodeId: number): { pixels: Uint32Array; width: number; height: number } | null {
  const fns = loadPw();
  if (!fns) return null;

  const dupFd = lc2.dup(pwFd) as number;
  if (dupFd < 0) return null;

  const loop_ = fns.pw_main_loop_new(0n);
  if (!loop_) { lc2.close(dupFd); return null; }

  const pwLoop = fns.pw_main_loop_get_loop(loop_);
  const context = fns.pw_context_new(pwLoop, 0n, 0);
  if (!context) {
    fns.pw_main_loop_destroy(loop_);
    lc2.close(dupFd);
    return null;
  }

  const core = fns.pw_context_connect_fd(context, dupFd, 0n, 0);
  if (!core) {
    lc2.close(dupFd);
    fns.pw_context_destroy(context);
    fns.pw_main_loop_destroy(loop_);
    return null;
  }

  const streamName = cstr("mechatron-capture");
  const stream = fns.pw_stream_new(core, bp(streamName), 0n);
  if (!stream) {
    fns.pw_core_disconnect(core);
    fns.pw_context_destroy(context);
    fns.pw_main_loop_destroy(loop_);
    return null;
  }

  let frame: { pixels: Uint32Array; width: number; height: number } | null = null;
  let negotiatedFormat = SPA_VIDEO_FORMAT_BGRx;

  const cbParamChanged = new F.JSCallback(
    (_data: any, id: any, param: any) => {
      const paramBig = typeof param === "bigint" ? param : BigInt(param ?? 0);
      if (paramBig === 0n || id !== SPA_PARAM_Format) return;
      const podSize = F.read.u32(paramBig, 0);
      const bodyStart = 8;
      let pos = bodyStart + 8;
      const end = bodyStart + podSize;
      while (pos + 16 <= end) {
        const key = F.read.u32(paramBig, pos);
        pos += 8;
        if (pos + 8 > end) break;
        const childSize = F.read.u32(paramBig, pos);
        const childType = F.read.u32(paramBig, pos + 4);
        if (key === SPA_FORMAT_VIDEO_format && childType === SPA_TYPE_Id && childSize === 4 && pos + 12 <= end) {
          negotiatedFormat = F.read.u32(paramBig, pos + 8);
          break;
        }
        pos += 8 + ((childSize + 7) & ~7);
      }
    },
    { args: [T.i64, T.u32, T.i64] },
  );

  const cbProcess = new F.JSCallback(
    (_data: any) => {
      const buf = fns.pw_stream_dequeue_buffer(stream);
      if (!buf) return;

      const spaBuf = F.read.ptr(buf, 0);
      if (!spaBuf) { fns.pw_stream_queue_buffer(stream, buf); return; }

      const nDatas = F.read.u32(spaBuf, 0);
      const datasPtr = F.read.ptr(spaBuf, 8);
      if (nDatas === 0 || !datasPtr) {
        fns.pw_stream_queue_buffer(stream, buf);
        return;
      }

      const dataPtr = F.read.ptr(datasPtr, 24);
      const chunkPtr = F.read.ptr(datasPtr, 32);
      if (!dataPtr || !chunkPtr) {
        fns.pw_stream_queue_buffer(stream, buf);
        return;
      }

      const offset = F.read.u32(chunkPtr, 0);
      const size = F.read.u32(chunkPtr, 4);
      const stride = F.read.i32(chunkPtr, 8);
      if (stride === 0) { fns.pw_stream_queue_buffer(stream, buf); return; }

      const h = Math.floor(size / Math.abs(stride));
      const w = Math.floor(Math.abs(stride) / 4);
      if (w === 0 || h === 0) { fns.pw_stream_queue_buffer(stream, buf); return; }

      const needed = w * h * 4;
      const srcPtr = (typeof dataPtr === "bigint" ? dataPtr : BigInt(dataPtr)) + BigInt(offset);

      const pixBuf = new Uint8Array(needed);
      const lc = getLibc();
      const lf = libcFFI();
      if (lc && lf) {
        const dstPtr = bp(pixBuf);
        lc.memcpy(dstPtr, srcPtr, BigInt(needed));
      }

      const src = new Uint32Array(pixBuf.buffer);
      const pixels = convertToArgb(src, w, h, negotiatedFormat);
      frame = { pixels, width: w, height: h };

      fns.pw_stream_queue_buffer(stream, buf);
      fns.pw_main_loop_quit(loop_);
    },
    { args: [T.i64] },
  );

  const cbStateChanged = new F.JSCallback(
    (_data: any, _old: any, state: any) => {
      if (state === PW_STREAM_STATE_ERROR) fns.pw_main_loop_quit(loop_);
    },
    { args: [T.i64, T.i32, T.i32, T.i64] },
  );

  // PwStreamEvents struct: version(u32) + pad(4) + 12 function pointers = 104 bytes
  const evBuf = new Uint8Array(104);
  const evDv = new DataView(evBuf.buffer);
  evDv.setUint32(0, PW_VERSION_STREAM_EVENTS, true);
  const ptrOf = (cb: any): bigint => {
    const p = cb.ptr;
    return typeof p === "bigint" ? p : BigInt(p as number);
  };
  evDv.setBigUint64(16, ptrOf(cbStateChanged), true);
  evDv.setBigUint64(40, ptrOf(cbParamChanged), true);
  evDv.setBigUint64(64, ptrOf(cbProcess), true);

  // SpaHook: 48 bytes zeroed
  const hookBuf = new Uint8Array(48);

  fns.pw_stream_add_listener(stream, bp(hookBuf), bp(evBuf), 0n);

  const formatPod = buildVideoFormatPod();
  const paramsArr = new BigUint64Array([bp(formatPod)]);
  const paramsBuf = new Uint8Array(paramsArr.buffer);

  const flags = PW_STREAM_FLAG_AUTOCONNECT | PW_STREAM_FLAG_MAP_BUFFERS;
  const ret = fns.pw_stream_connect(stream, PW_DIRECTION_INPUT, nodeId, flags, bp(paramsBuf), 1);

  if (ret < 0) {
    cbParamChanged.close();
    cbProcess.close();
    cbStateChanged.close();
    fns.pw_stream_destroy(stream);
    fns.pw_core_disconnect(core);
    fns.pw_context_destroy(context);
    fns.pw_main_loop_destroy(loop_);
    return null;
  }

  fns.pw_main_loop_run(loop_);

  cbParamChanged.close();
  cbProcess.close();
  cbStateChanged.close();
  fns.pw_stream_destroy(stream);
  fns.pw_core_disconnect(core);
  fns.pw_context_destroy(context);
  fns.pw_main_loop_destroy(loop_);

  return frame;
}

// ── Session management ──────────────────────────────────────────────

let session: ScreencastSession | null = null;
let pendingToken: string | null = null;
let initTried = false;

function ensureSession(): boolean {
  if (session) return true;
  if (initTried) return false;
  initTried = true;

  const isWayland = !!process.env.WAYLAND_DISPLAY
    || (process.env.XDG_SESSION_TYPE || "") === "wayland";
  if (!isWayland) return false;

  const s = portalGetScreencastSession(pendingToken ?? undefined);
  if (s) { session = s; return true; }
  return false;
}

// ── Exported operations (called by worker) ──────────────────────────

interface RawRect { x: number; y: number; w: number; h: number; }
interface ScreenInfo { bounds: RawRect; usable: RawRect; }

export function screen_synchronize(): ScreenInfo[] | null {
  if (!ensureSession() || !session) return null;
  return [{
    bounds: { x: 0, y: 0, w: session.width, h: session.height },
    usable: { x: 0, y: 0, w: session.width, h: session.height },
  }];
}

export function screen_grabScreen(
  x: number, y: number, w: number, h: number,
): Uint32Array | null {
  if (!ensureSession() || !session) return null;

  const grabbed = pwGrabFrame(session.pwFd, session.nodeId);
  if (!grabbed) return null;

  const { pixels, width: fw, height: fh } = grabbed;
  const cx = Math.max(0, Math.min(x, fw));
  const cy = Math.max(0, Math.min(y, fh));
  const cw = Math.min(w, fw - cx);
  const ch = Math.min(h, fh - cy);
  if (cw <= 0 || ch <= 0) return null;

  if (cx === 0 && cy === 0 && cw === fw && ch === fh) return pixels;

  const cropped = new Uint32Array(cw * ch);
  for (let row = 0; row < ch; row++) {
    const srcOff = (cy + row) * fw + cx;
    cropped.set(pixels.subarray(srcOff, srcOff + cw), row * cw);
  }
  return cropped;
}

export function screen_getPortalToken(): string | null {
  return session?.restoreToken ?? pendingToken;
}

export function screen_setPortalToken(token: string | null): void {
  pendingToken = token;
}
