/**
 * Shared Wayland FFI primitives for ffi[portal] subsystems.
 *
 * Dlopens libwayland-client.so.0 and provides typed wrappers for the
 * core client API: display connection, proxy marshalling, and listener
 * registration.  Also provides WlProto, a builder for constructing
 * WlInterface / WlMessage structs in native memory.
 *
 * Uses wl_proxy_marshal_array_flags (non-variadic) instead of the
 * variadic wl_proxy_marshal_flags, for reliable FFI calling on both
 * x86_64 and aarch64.
 */

import { getBunFFI, bp, cstr, type Pointer } from "./bun";

export interface WlFuncs {
  connect(name: bigint): bigint;
  disconnect(display: bigint): void;
  roundtrip(display: bigint): number;
  getFd(display: bigint): number;
  dispatch(display: bigint): number;
  marshalArray(proxy: bigint, opcode: number, iface: bigint, version: number, flags: number, args: bigint): bigint;
  addListener(proxy: bigint, impl: bigint, data: bigint): number;
  destroy(proxy: bigint): void;
  getVersion(proxy: bigint): number;
}

export const WL_MARSHAL_FLAG_DESTROY = 1;

let _loaded = false;
let _wl: WlFuncs | null = null;

export function loadWayland(): WlFuncs | null {
  if (_loaded) return _wl;
  _loaded = true;

  const F = getBunFFI();
  if (!F) return null;
  const T = F.FFIType;

  let syms: any;
  try {
    syms = F.dlopen("libwayland-client.so.0", {
      wl_display_connect:           { args: [T.i64], returns: T.i64 },
      wl_display_disconnect:        { args: [T.i64], returns: T.void },
      wl_display_roundtrip:         { args: [T.i64], returns: T.i32 },
      wl_display_get_fd:            { args: [T.i64], returns: T.i32 },
      wl_display_dispatch:          { args: [T.i64], returns: T.i32 },
      wl_proxy_marshal_array_flags: { args: [T.i64, T.u32, T.i64, T.u32, T.u32, T.i64], returns: T.i64 },
      wl_proxy_add_listener:        { args: [T.i64, T.i64, T.i64], returns: T.i32 },
      wl_proxy_destroy:             { args: [T.i64], returns: T.void },
      wl_proxy_get_version:         { args: [T.i64], returns: T.u32 },
    }).symbols;
  } catch {
    return null;
  }

  const s = syms;
  _wl = {
    connect:      (n) => s.wl_display_connect(n),
    disconnect:   (d) => s.wl_display_disconnect(d),
    roundtrip:    (d) => s.wl_display_roundtrip(d),
    getFd:        (d) => s.wl_display_get_fd(d),
    dispatch:     (d) => s.wl_display_dispatch(d),
    marshalArray: (p, o, i, v, f, a) => s.wl_proxy_marshal_array_flags(p, o, i, v, f, a),
    addListener:  (p, i, d) => s.wl_proxy_add_listener(p, i, d),
    destroy:      (p) => s.wl_proxy_destroy(p),
    getVersion:   (p) => s.wl_proxy_get_version(p),
  };
  return _wl;
}

/**
 * Build a wl_argument array from JS values.
 *
 * Each wl_argument union is 8 bytes (pointer-sized on LP64).
 * Numbers are written as u32 at the start of the slot (for
 * i/u/f/h/n types).  Bigints are written as u64 (for s/o/a
 * pointer types).
 */
export function wlArgs(...values: (number | bigint)[]): Uint8Array {
  const buf = new Uint8Array(values.length * 8);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === "bigint") {
      dv.setBigUint64(i * 8, v, true);
    } else {
      dv.setUint32(i * 8, v, true);
    }
  }
  return buf;
}

/**
 * Builder for Wayland protocol interface definitions in native memory.
 *
 * Manages lifetime of all allocated buffers.  The WlProto instance must
 * be kept alive for as long as any Wayland objects reference its interfaces.
 *
 * Struct layouts (LP64):
 *   WlInterface: name(8) version(4) method_count(4) methods(8)
 *                event_count(4) pad(4) events(8) = 40 bytes
 *   WlMessage:   name(8) signature(8) types(8) = 24 bytes
 */
export class WlProto {
  private keep: ArrayBufferView[] = [];

  private pstr(s: string): bigint {
    const buf = cstr(s);
    this.keep.push(buf);
    return bp(buf);
  }

  private alloc(size: number): { dv: DataView; ptr: bigint } {
    const buf = new Uint8Array(size);
    this.keep.push(buf);
    return { dv: new DataView(buf.buffer), ptr: bp(buf) };
  }

  /** Build a types array (array of WlInterface pointers, null = no type). */
  types(refs: (bigint | null)[]): bigint {
    if (refs.length === 0) return 0n;
    const a = new BigUint64Array(refs.length);
    for (let i = 0; i < refs.length; i++) a[i] = refs[i] ?? 0n;
    this.keep.push(a);
    return bp(a);
  }

  private msgs(defs: { name: string; sig: string; types: bigint }[]): bigint {
    if (defs.length === 0) return 0n;
    const { dv, ptr } = this.alloc(defs.length * 24);
    for (let i = 0; i < defs.length; i++) {
      dv.setBigUint64(i * 24,      this.pstr(defs[i].name), true);
      dv.setBigUint64(i * 24 + 8,  this.pstr(defs[i].sig), true);
      dv.setBigUint64(i * 24 + 16, defs[i].types, true);
    }
    return ptr;
  }

  /** Build a WlInterface struct.  Returns pointer to the native struct. */
  iface(
    name: string, version: number,
    methods: { name: string; sig: string; types: bigint }[],
    events: { name: string; sig: string; types: bigint }[],
  ): bigint {
    const mPtr = this.msgs(methods);
    const ePtr = this.msgs(events);
    const { dv, ptr } = this.alloc(40);
    dv.setBigUint64(0, this.pstr(name), true);
    dv.setInt32(8, version, true);
    dv.setInt32(12, methods.length, true);
    dv.setBigUint64(16, mPtr, true);
    dv.setInt32(24, events.length, true);
    dv.setBigUint64(32, ePtr, true);
    return ptr;
  }

  /** Build a listener struct (array of native function pointers). */
  listener(callbacks: { ptr: Pointer }[]): bigint {
    const buf = new BigUint64Array(callbacks.length);
    for (let i = 0; i < callbacks.length; i++) {
      const p = callbacks[i].ptr;
      buf[i] = typeof p === "bigint" ? p : BigInt(p as number);
    }
    this.keep.push(buf);
    return bp(buf);
  }
}
