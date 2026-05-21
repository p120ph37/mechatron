/**
 * Type-safe wrapper around `bun:ffi`.
 *
 * `bun:ffi` is only available when running under Bun.  This module wraps the
 * dynamic import in a function so Node.js can still parse the file (the body
 * is never executed under Node — the `napi` backend is selected instead).
 *
 * `bun-types` is intentionally not a devDependency: keeping it out lets the
 * project compile under Node-only TypeScript installs.  We define just the
 * shape we use here.
 */

export type Pointer = number | bigint | null;

export interface FFITypes {
  void: number;
  bool: number;
  char: number;
  i8: number;
  u8: number;
  i16: number;
  u16: number;
  i32: number;
  u32: number;
  i64: number;
  u64: number;
  f32: number;
  f64: number;
  ptr: number;
  cstring: number;
}

export interface DlopenResult<S> {
  symbols: S;
  close(): void;
}

export interface BunFFI {
  FFIType: FFITypes;
  suffix: string;
  dlopen<S>(path: string, symbols: any): DlopenResult<S>;
  /** Read primitive values from a pointer. */
  read: {
    i32(ptr: Pointer, off?: number): number;
    u32(ptr: Pointer, off?: number): number;
    i64(ptr: Pointer, off?: number): bigint;
    u64(ptr: Pointer, off?: number): bigint;
    ptr(ptr: Pointer, off?: number): bigint;
  };
  /** Get a JS pointer for a TypedArray. */
  ptr(view: ArrayBufferView, byteOffset?: number, byteLength?: number): Pointer;
  /** Wrap a raw pointer as an ArrayBuffer view (no copy). */
  toArrayBuffer(ptr: Pointer, byteOffset?: number, byteLength?: number): ArrayBuffer;
  /** Read a NUL-terminated C string from a pointer. */
  CString: new (ptr: Pointer, byteOffset?: number, byteLength?: number) => string;
  /** Convert a JS string to a NUL-terminated buffer suitable as a `cstring` arg. */
  toBuffer?(value: string): Uint8Array;
  /**
   * JSCallback wraps a JS function as a native function pointer.  Used to
   * install C-callable handlers like XSetErrorHandler so Xlib errors can be
   * swallowed instead of triggering libX11's default handler (which calls
   * exit(1) and kills the Bun process).
   */
  JSCallback: new (
    fn: (...args: any[]) => any,
    spec: { args?: number[]; returns?: number },
  ) => { readonly ptr: Pointer; close(): void };
}

let _ffi: BunFFI | null | undefined;

/** Lazy-load `bun:ffi`.  Returns null on Node.js. */
export function getBunFFI(): BunFFI | null {
  if (_ffi !== undefined) return _ffi;
  if (typeof (globalThis as any).Bun === "undefined") {
    _ffi = null;
    return null;
  }
  // Direct CJS require — `bun:ffi` is provided by the Bun runtime, and
  // Node never reaches this branch because of the `Bun === "undefined"`
  // gate above.
  _ffi = require("bun:ffi") as BunFFI;
  return _ffi;
}

/** Encode a JS string as a NUL-terminated UTF-8 buffer suitable as `cstring`. */
export function cstr(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  const buf = new Uint8Array(enc.length + 1);
  buf.set(enc);
  buf[enc.length] = 0;
  return buf;
}

const _cstrCache = new Map<string, Uint8Array>();

/**
 * Convert F.ptr() result to bigint for T.i64 FFI args.
 *
 * On darwin, all pointer-typed FFI args use T.i64 so that opaque 64-bit
 * values (including tagged pointers) survive the bun:ffi boundary.  This
 * helper normalises the Pointer union returned by F.ptr().
 */
export function bp(view: ArrayBufferView): bigint {
  const F = getBunFFI();
  if (!F) throw new Error("bun:ffi not available");
  const p = F.ptr(view);
  return typeof p === "bigint" ? p : BigInt(p as number);
}

/**
 * Decode a NUL-terminated C string at a (possibly 64-bit) pointer.
 *
 * Bun's `new F.CString(ptr)` rejects bigint args at runtime — when given
 * one it returns a String *object* whose value is the bun TypeError
 * message rather than throwing or returning the C string.  This helper
 * reads the bytes via libc memcpy into a JS-owned buffer (so the source
 * pointer can be a full 64-bit bigint without lossy Number() narrowing)
 * and decodes UTF-8.  `byteLen`, when provided, is treated as an upper
 * bound; the actual string length is determined by libc's strnlen.
 */
export function cstringFromPtr(ptr: Pointer, byteLen?: number): string {
  if (ptr === 0n || ptr === 0 || ptr == null) return "";
  // Normalise to bigint so the libc memcpy/strnlen calls receive the
  // full 64-bit address regardless of how bun:ffi surfaced the pointer.
  const big: bigint = typeof ptr === "bigint" ? ptr : BigInt(ptr);
  // require lazily to avoid forcing libc.ts to load if not needed.
  const { libc, libcFFI } = require("./libc") as typeof import("./libc");
  const lc = libc();
  const lf = libcFFI();
  if (!lc || !lf) return "";
  const max = BigInt(byteLen ?? 0x10000);
  const len = Number(lc.strnlen(big, max));
  if (len === 0) return "";
  const buf = new Uint8Array(len);
  const dest = lf.ptr(buf);
  const destBig: bigint = typeof dest === "bigint" ? dest : BigInt(dest as number);
  lc.memcpy(destBig, big, BigInt(len));
  return new TextDecoder("utf-8").decode(buf);
}

/** Like cstr() but caches the result — use for repeated short strings. */
export function cstrCached(s: string): Uint8Array {
  let buf = _cstrCache.get(s);
  if (buf) return buf;
  buf = cstr(s);
  _cstrCache.set(s, buf);
  return buf;
}
