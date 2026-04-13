/**
 * Linux libc FFI helpers shared between subsystems.
 *
 * Wraps a small subset of libc:
 *   - process_vm_readv / process_vm_writev (cross-process memory)
 *   - kill (signal delivery to other PIDs)
 *   - sysconf (page size, etc.)
 *   - getpid (current process id)
 *
 * The /proc filesystem is read directly via Node's `fs` module — no FFI
 * needed for that.
 */

import { getBunFFI, type BunFFI, type Pointer } from "./bun";

interface Libc {
  // ssize_t process_vm_readv(pid_t pid,
  //   const struct iovec *local_iov,  unsigned long liovcnt,
  //   const struct iovec *remote_iov, unsigned long riovcnt,
  //   unsigned long flags);
  process_vm_readv: (
    pid: number,
    local_iov: Pointer, liovcnt: bigint,
    remote_iov: Pointer, riovcnt: bigint,
    flags: bigint,
  ) => bigint;
  process_vm_writev: (
    pid: number,
    local_iov: Pointer, liovcnt: bigint,
    remote_iov: Pointer, riovcnt: bigint,
    flags: bigint,
  ) => bigint;
  kill: (pid: number, sig: number) => number;
  sysconf: (name: number) => bigint;
  getpid: () => number;
}

let _opened = false;
let _ffi: BunFFI | null = null;
let _libc: Libc | null = null;

function tryDlopen(): void {
  if (_opened) return;
  _opened = true;
  _ffi = getBunFFI();
  if (!_ffi) return;
  const T = _ffi.FFIType;

  // glibc is "libc.so.6"; musl uses "libc.so".  Try both.
  for (const name of ["libc.so.6", "libc.so", "libc.musl-x86_64.so.1", "libc.musl-aarch64.so.1"]) {
    try {
      const lib = _ffi.dlopen<Libc>(name, {
        process_vm_readv:  { args: [T.i32, T.ptr, T.u64, T.ptr, T.u64, T.u64], returns: T.i64 },
        process_vm_writev: { args: [T.i32, T.ptr, T.u64, T.ptr, T.u64, T.u64], returns: T.i64 },
        kill:              { args: [T.i32, T.i32], returns: T.i32 },
        sysconf:           { args: [T.i32], returns: T.i64 },
        getpid:            { args: [], returns: T.i32 },
      });
      _libc = lib.symbols;
      return;
    } catch (_) { /* try next */ }
  }
}

export function libc(): Libc | null {
  tryDlopen();
  return _libc;
}

export function libcFFI(): BunFFI | null {
  tryDlopen();
  return _ffi;
}

// signal numbers (Linux)
export const SIGTERM = 15;
export const SIGKILL = 9;

// sysconf names (Linux)
export const _SC_PAGESIZE = 30;

/**
 * Build a libc `struct iovec { void *base; size_t len; }` (16 bytes on 64-bit)
 * pointing at the given typed-array buffer.  Returns the iovec buffer plus the
 * raw pointer to the data — caller must keep both alive for the duration of
 * the FFI call.
 */
export function makeIovec(F: BunFFI, buf: Uint8Array): { iov: BigUint64Array; dataPtr: bigint } {
  const dataPtr = BigInt(F.ptr(buf) as any);
  const iov = new BigUint64Array(2);
  iov[0] = dataPtr;
  iov[1] = BigInt(buf.byteLength);
  return { iov, dataPtr };
}

/**
 * Same shape but for a raw remote address (no JS buffer involved).
 */
export function makeRemoteIovec(addr: bigint, len: number): BigUint64Array {
  const iov = new BigUint64Array(2);
  iov[0] = addr;
  iov[1] = BigInt(len);
  return iov;
}
