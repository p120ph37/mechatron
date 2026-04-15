/**
 * Shared libc FFI surface.
 *
 * Bun's `dlopen("libc.so.6")` works on every glibc and musl-compat distro
 * we target.  This module centralises the syscall shims (`open`, `close`,
 * `ioctl`, `mmap`, `munmap`, `read`, `pread`) so other `lib/ffi/*` modules
 * (`uinput.ts`, `framebuffer.ts`) don't each reopen libc with a different
 * subset of symbols.
 *
 * All symbols are lazy — the first call to `libc()` dlopens on success and
 * caches the result; subsequent calls are cheap.  Failure (non-Linux, bun:ffi
 * absent, missing .so) latches a diagnostic string readable via
 * `libcOpenReason()`.
 */

import { getBunFFI, type BunFFI } from "./bun";

export interface LibC {
  // File descriptors
  open: (pathname: bigint, flags: number, mode: number) => number;
  close: (fd: number) => number;
  read: (fd: number, buf: bigint, count: bigint) => bigint;
  // Request is unsigned long; third arg is "either a pointer or an integer",
  // collapses to a single u64 register on every arch we target.
  ioctl: (fd: number, request: bigint, arg: bigint) => number;
  // Memory mapping — mmap returns MAP_FAILED (== (void*)-1 == 0xFFFF...F) on
  // error, which the bun:ffi u64 return surfaces as ~0n.  Callers check.
  mmap: (
    addr: bigint, length: bigint, prot: number, flags: number,
    fd: number, offset: bigint,
  ) => bigint;
  munmap: (addr: bigint, length: bigint) => number;
}

// mmap prot/flags (Linux, same across x86_64/aarch64/arm/riscv64).
export const PROT_READ  = 0x1;
export const PROT_WRITE = 0x2;
export const MAP_SHARED = 0x01;
export const MAP_PRIVATE = 0x02;
export const MAP_FAILED = ~0n; // (void*)-1 cast to u64

// open(2) flags — just the ones we use.
export const O_RDONLY = 0x000;
export const O_RDWR   = 0x002;
export const O_CLOEXEC = 0o2000000;

let _opened = false;
let _libc: LibC | null = null;
let _ffi: BunFFI | null = null;
let _reason: string | null = null;

function openLibc(): void {
  if (_opened) return;
  _opened = true;
  if (process.platform !== "linux") {
    _reason = "not Linux";
    return;
  }
  _ffi = getBunFFI();
  if (!_ffi) {
    _reason = "bun:ffi not available";
    return;
  }
  const T = _ffi.FFIType;
  try {
    const h = _ffi.dlopen<LibC>("libc.so.6", {
      open:   { args: [T.u64, T.i32, T.i32], returns: T.i32 },
      close:  { args: [T.i32], returns: T.i32 },
      read:   { args: [T.i32, T.u64, T.u64], returns: T.i64 },
      ioctl:  { args: [T.i32, T.u64, T.u64], returns: T.i32 },
      mmap:   { args: [T.u64, T.u64, T.i32, T.i32, T.i32, T.u64], returns: T.u64 },
      munmap: { args: [T.u64, T.u64], returns: T.i32 },
    });
    _libc = h.symbols;
  } catch (e) {
    _reason = (e as Error).message || String(e);
  }
}

/** Get the cached libc handle (lazy-open).  Returns null on any failure. */
export function libc(): LibC | null {
  if (!_opened) openLibc();
  return _libc;
}

/** The shared bun:ffi handle used when calling libc — needed for `ptr()`. */
export function libcFFI(): BunFFI | null {
  if (!_opened) openLibc();
  return _ffi;
}

/** Diagnostic: why did `libc()` fail to resolve? */
export function libcOpenReason(): string | null { return _reason; }
