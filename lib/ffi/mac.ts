/**
 * macOS FFI helpers shared between subsystems.
 *
 * Opens the core frameworks and system libraries that mechatron needs, all
 * via `dlopen` against their on-disk paths:
 *
 *   - `/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics`
 *     — CGEvent*, CGDisplay*, CGContext*, CGImage*, CGColorSpace*.
 *
 *   - `/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation`
 *     — CFRelease, CFStringCreateWithCString, CFStringGetCString, CFDataGet*.
 *
 *   - `/System/Library/Frameworks/AppKit.framework/AppKit`
 *     — needed so `NSPasteboard` and `NSImage` Objective-C classes are
 *     resolvable by `objc_getClass` (the AppKit library loads the classes
 *     and the pasteboard-type NSString constants into the process).
 *
 *   - `/usr/lib/libobjc.A.dylib` — `objc_getClass`, `sel_registerName`,
 *     `objc_msgSend`, autorelease-pool helpers.  Each call site typically
 *     wants its own typed view of `objc_msgSend`, so we expose the raw
 *     pointer and let callers wrap it with `CFunction({ args, returns, ptr })`.
 *
 *   - `libSystem.B.dylib` (libc + mach) — `proc_pidpath`, `proc_listallpids`,
 *     `proc_name`, `proc_pidinfo`, `kill`, `sysconf`, `getpid`, and the
 *     mach_vm family we need for memory r/w.
 *
 * ### Struct-by-value caveats
 *
 * `bun:ffi` lowers struct-by-value *arguments* of up to 4 doubles to 4 f64
 * registers on both x86_64 SysV and arm64 AAPCS — so `CGPoint` passes as
 * two `f64` arguments and `CGRect` as four, no extra glue needed.  Struct
 * *returns* don't work: callers that need them (e.g. `CGEventGetLocation`,
 * `NSScreen.frame`) use napi-provided fallbacks or degrade gracefully.
 */

import { getBunFFI, cstr, type BunFFI, type Pointer } from "./bun";

// ── Interfaces ────────────────────────────────────────────────────────

interface CoreGraphics {
  // Event sources + keyboard/mouse events
  CGEventSourceCreate: (stateID: number) => Pointer;
  CGEventCreate: (source: Pointer) => Pointer;
  CGEventCreateKeyboardEvent: (source: Pointer, vk: number, keyDown: number) => Pointer;
  CGEventCreateMouseEvent: (source: Pointer, type: number, x: number, y: number, button: number) => Pointer;
  CGEventCreateScrollWheelEvent2: (source: Pointer, units: number, wheelCount: number, w1: number, w2: number, w3: number) => Pointer;
  CGEventPost: (tap: number, event: Pointer) => void;
  CGEventSourceKeyState: (stateID: number, key: number) => number;
  CGEventSourceButtonState: (stateID: number, button: number) => number;
  CGEventSetType: (event: Pointer, type: number) => void;
  CGEventSetIntegerValueField: (event: Pointer, field: number, value: bigint) => void;
  // Cursor
  CGWarpMouseCursorPosition: (x: number, y: number) => number;
  CGAssociateMouseAndMouseCursorPosition: (connected: number) => number;
  // Displays
  CGMainDisplayID: () => number;
  CGGetActiveDisplayList: (max: number, displays: Pointer, count: Pointer) => number;
  CGDisplayPixelsWide: (id: number) => bigint;
  CGDisplayPixelsHigh: (id: number) => bigint;
  CGDisplayIsActive: (id: number) => number;
  CGDisplayCreateImage: (id: number) => Pointer;
  // Bitmap / image
  CGBitmapContextCreate: (
    data: Pointer, width: bigint, height: bigint,
    bitsPerComponent: bigint, bytesPerRow: bigint,
    space: Pointer, bitmapInfo: number,
  ) => Pointer;
  CGBitmapContextGetData: (ctx: Pointer) => Pointer;
  CGBitmapContextCreateImage: (ctx: Pointer) => Pointer;
  CGContextDrawImage: (ctx: Pointer, rx: number, ry: number, rw: number, rh: number, image: Pointer) => void;
  CGContextRelease: (ctx: Pointer) => void;
  CGImageRelease: (image: Pointer) => void;
  CGImageGetWidth: (image: Pointer) => bigint;
  CGImageGetHeight: (image: Pointer) => bigint;
  CGColorSpaceCreateDeviceRGB: () => Pointer;
  CGColorSpaceRelease: (space: Pointer) => void;
}

interface CoreFoundation {
  CFRelease: (cf: Pointer) => void;
  CFStringCreateWithCString: (alloc: Pointer, str: Pointer, encoding: number) => Pointer;
  CFStringGetCString: (s: Pointer, buf: Pointer, size: bigint, encoding: number) => number;
  CFStringGetLength: (s: Pointer) => bigint;
  CFStringGetMaximumSizeForEncoding: (len: bigint, encoding: number) => bigint;
}

interface Objc {
  objc_getClass: (name: Pointer) => Pointer;
  sel_registerName: (name: Pointer) => Pointer;
  /** Base pointer to objc_msgSend; wrap with CFunction per call site. */
  objc_msgSend: (receiver: Pointer, selector: Pointer) => Pointer;
  objc_autoreleasePoolPush: () => Pointer;
  objc_autoreleasePoolPop: (pool: Pointer) => void;
}

interface Libc {
  // libproc
  proc_pidpath: (pid: number, buf: Pointer, bufsize: number) => number;
  proc_name: (pid: number, buf: Pointer, bufsize: number) => number;
  proc_listallpids: (buf: Pointer, bufsize: number) => number;
  proc_pidinfo: (pid: number, flavor: number, arg: bigint, buf: Pointer, bufsize: number) => number;
  // POSIX
  kill: (pid: number, sig: number) => number;
  sysconf: (name: number) => bigint;
  getpid: () => number;
  realpath: (path: Pointer, resolved: Pointer) => Pointer;
  // mach
  mach_task_self: () => number;
  task_for_pid: (target_tport: number, pid: number, t: Pointer) => number;
  mach_vm_read_overwrite: (target: number, addr: bigint, size: bigint, data: bigint, outsize: Pointer) => number;
  mach_vm_write: (target: number, addr: bigint, data: bigint, cnt: number) => number;
  mach_vm_protect: (target: number, addr: bigint, size: bigint, setMax: number, newProt: number) => number;
  mach_vm_region: (target: number, addr: Pointer, size: Pointer, flavor: number, info: Pointer, cnt: Pointer, obj: Pointer) => number;
  task_info: (target: number, flavor: number, info: Pointer, cnt: Pointer) => number;
  task_get_exception_ports: (
    task: number, mask: number,
    masks: Pointer, cnt: Pointer,
    ports: Pointer, behaviors: Pointer, flavors: Pointer,
  ) => number;
  uname: (buf: Pointer) => number;
  free: (ptr: Pointer) => void;
}

// ── State ─────────────────────────────────────────────────────────────

let _opened = false;
let _ffi: BunFFI | null = null;
let _cg: CoreGraphics | null = null;
let _cf: CoreFoundation | null = null;
let _objc: Objc | null = null;
let _libc: Libc | null = null;
let _appkitLoaded = false;

// ── Load ──────────────────────────────────────────────────────────────

function tryDlopen(): void {
  if (_opened) return;
  _opened = true;
  _ffi = getBunFFI();
  if (!_ffi) return;
  if (process.platform !== "darwin") return;
  const T = _ffi.FFIType;

  const CG_PATH = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";
  const CF_PATH = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
  const AK_PATH = "/System/Library/Frameworks/AppKit.framework/AppKit";
  const OBJC_PATH = "/usr/lib/libobjc.A.dylib";
  const LIBC_PATH = "/usr/lib/libSystem.B.dylib";

  try {
    const lib = _ffi.dlopen<CoreGraphics>(CG_PATH, {
      CGEventSourceCreate:                  { args: [T.u32], returns: T.ptr },
      CGEventCreate:                        { args: [T.ptr], returns: T.ptr },
      CGEventCreateKeyboardEvent:           { args: [T.ptr, T.u16, T.i32], returns: T.ptr },
      // CGPoint passed as two f64s (SysV/AAPCS HFA or separate args — same ABI).
      CGEventCreateMouseEvent:              { args: [T.ptr, T.u32, T.f64, T.f64, T.u32], returns: T.ptr },
      // Non-variadic scroll helper — bun:ffi can't dispatch to variadics.
      CGEventCreateScrollWheelEvent2:       { args: [T.ptr, T.u32, T.u32, T.i32, T.i32, T.i32], returns: T.ptr },
      CGEventPost:                          { args: [T.u32, T.ptr], returns: T.void },
      CGEventSourceKeyState:                { args: [T.u32, T.u16], returns: T.i32 },
      CGEventSourceButtonState:             { args: [T.u32, T.u32], returns: T.i32 },
      CGEventSetType:                       { args: [T.ptr, T.u32], returns: T.void },
      CGEventSetIntegerValueField:          { args: [T.ptr, T.u32, T.i64], returns: T.void },
      CGWarpMouseCursorPosition:            { args: [T.f64, T.f64], returns: T.i32 },
      CGAssociateMouseAndMouseCursorPosition: { args: [T.i32], returns: T.i32 },
      CGMainDisplayID:                      { args: [], returns: T.u32 },
      CGGetActiveDisplayList:               { args: [T.u32, T.ptr, T.ptr], returns: T.i32 },
      CGDisplayPixelsWide:                  { args: [T.u32], returns: T.u64 },
      CGDisplayPixelsHigh:                  { args: [T.u32], returns: T.u64 },
      CGDisplayIsActive:                    { args: [T.u32], returns: T.i32 },
      CGDisplayCreateImage:                 { args: [T.u32], returns: T.ptr },
      CGBitmapContextCreate:                { args: [T.ptr, T.u64, T.u64, T.u64, T.u64, T.ptr, T.u32], returns: T.ptr },
      CGBitmapContextGetData:               { args: [T.ptr], returns: T.ptr },
      CGBitmapContextCreateImage:           { args: [T.ptr], returns: T.ptr },
      // CGRect passed as 4 f64 args.
      CGContextDrawImage:                   { args: [T.ptr, T.f64, T.f64, T.f64, T.f64, T.ptr], returns: T.void },
      CGContextRelease:                     { args: [T.ptr], returns: T.void },
      CGImageRelease:                       { args: [T.ptr], returns: T.void },
      CGImageGetWidth:                      { args: [T.ptr], returns: T.u64 },
      CGImageGetHeight:                     { args: [T.ptr], returns: T.u64 },
      CGColorSpaceCreateDeviceRGB:          { args: [], returns: T.ptr },
      CGColorSpaceRelease:                  { args: [T.ptr], returns: T.void },
    });
    _cg = lib.symbols;
  } catch (_) { _cg = null; }

  try {
    const lib = _ffi.dlopen<CoreFoundation>(CF_PATH, {
      CFRelease:                          { args: [T.ptr], returns: T.void },
      CFStringCreateWithCString:          { args: [T.ptr, T.ptr, T.u32], returns: T.ptr },
      CFStringGetCString:                 { args: [T.ptr, T.ptr, T.u64, T.u32], returns: T.i32 },
      CFStringGetLength:                  { args: [T.ptr], returns: T.i64 },
      CFStringGetMaximumSizeForEncoding:  { args: [T.i64, T.u32], returns: T.i64 },
    });
    _cf = lib.symbols;
  } catch (_) { _cf = null; }

  try {
    const lib = _ffi.dlopen<Objc>(OBJC_PATH, {
      objc_getClass:              { args: [T.ptr], returns: T.ptr },
      sel_registerName:           { args: [T.ptr], returns: T.ptr },
      // Generic 0-arg msgSend.  Typed per-signature wrappers are built
      // on demand via `msgSendTyped()` which re-dlopens objc_msgSend.
      objc_msgSend:               { args: [T.ptr, T.ptr], returns: T.ptr },
      objc_autoreleasePoolPush:   { args: [], returns: T.ptr },
      objc_autoreleasePoolPop:    { args: [T.ptr], returns: T.void },
    });
    _objc = lib.symbols;
  } catch (_) { _objc = null; }

  // We dlopen AppKit only so the Objective-C runtime loads its classes
  // (NSPasteboard, NSImage, etc.) and `objc_getClass("NSPasteboard")`
  // succeeds.  `bun:ffi.dlopen` requires at least one symbol to look up,
  // so we ask for `NSBeep` — a stable plain-C function the framework has
  // always exported.  We never actually call it.
  try {
    _ffi.dlopen<{ NSBeep: () => void }>(AK_PATH, {
      NSBeep: { args: [], returns: T.void },
    });
    _appkitLoaded = true;
  } catch (_) { _appkitLoaded = false; }

  try {
    const lib = _ffi.dlopen<Libc>(LIBC_PATH, {
      proc_pidpath:                 { args: [T.i32, T.ptr, T.u32], returns: T.i32 },
      proc_name:                    { args: [T.i32, T.ptr, T.u32], returns: T.i32 },
      proc_listallpids:             { args: [T.ptr, T.i32], returns: T.i32 },
      proc_pidinfo:                 { args: [T.i32, T.i32, T.u64, T.ptr, T.i32], returns: T.i32 },
      kill:                         { args: [T.i32, T.i32], returns: T.i32 },
      sysconf:                      { args: [T.i32], returns: T.i64 },
      getpid:                       { args: [], returns: T.i32 },
      realpath:                     { args: [T.ptr, T.ptr], returns: T.ptr },
      mach_task_self:               { args: [], returns: T.u32 },
      task_for_pid:                 { args: [T.u32, T.i32, T.ptr], returns: T.i32 },
      mach_vm_read_overwrite:       { args: [T.u32, T.u64, T.u64, T.u64, T.ptr], returns: T.i32 },
      mach_vm_write:                { args: [T.u32, T.u64, T.u64, T.u32], returns: T.i32 },
      mach_vm_protect:              { args: [T.u32, T.u64, T.u64, T.i32, T.i32], returns: T.i32 },
      mach_vm_region:               { args: [T.u32, T.ptr, T.ptr, T.i32, T.ptr, T.ptr, T.ptr], returns: T.i32 },
      task_info:                    { args: [T.u32, T.u32, T.ptr, T.ptr], returns: T.i32 },
      task_get_exception_ports:     { args: [T.u32, T.u32, T.ptr, T.ptr, T.ptr, T.ptr, T.ptr], returns: T.i32 },
      uname:                        { args: [T.ptr], returns: T.i32 },
      free:                         { args: [T.ptr], returns: T.void },
    });
    _libc = lib.symbols;
  } catch (_) { _libc = null; }
}

// ── Public accessors ──────────────────────────────────────────────────

export function cg(): CoreGraphics | null { tryDlopen(); return _cg; }
export function cf(): CoreFoundation | null { tryDlopen(); return _cf; }
export function objc(): Objc | null { tryDlopen(); return _objc; }
export function libc(): Libc | null { tryDlopen(); return _libc; }
export function macFFI(): BunFFI | null { tryDlopen(); return _ffi; }
export function hasAppKit(): boolean { tryDlopen(); return _appkitLoaded; }

// ── Constants (CoreGraphics) ─────────────────────────────────────────

export const kCGEventSourceStateHIDSystemState = 1;
export const kCGHIDEventTap = 0;

export const kCGEventLeftMouseDown  = 1;
export const kCGEventLeftMouseUp    = 2;
export const kCGEventRightMouseDown = 3;
export const kCGEventRightMouseUp   = 4;
export const kCGEventOtherMouseDown = 25;
export const kCGEventOtherMouseUp   = 26;

export const kCGMouseButtonLeft   = 0;
export const kCGMouseButtonRight  = 1;
export const kCGMouseButtonCenter = 2;

export const kCGScrollEventUnitPixel = 1;

// CGEvent integer-field keys used by mac_mouse_press/release to inject
// button presses without having to supply a cursor position (since we
// can't read CGEventGetLocation — struct-by-value return is unsupported).
export const kCGMouseEventButtonNumber = 3;

// CGImage bitmap info: little-endian 32-bit BGRA, premultiplied-first alpha.
// Equivalent to (kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst).
export const BITMAP_INFO_BGRA_PMA = (2 << 12) | 2;

// kCFStringEncodingUTF8
export const kCFStringEncodingUTF8 = 0x08000100;

// ── Constants (mach / process) ───────────────────────────────────────

export const TASK_DYLD_INFO = 17;
export const TASK_DYLD_INFO_COUNT = 6;

export const EXC_MASK_ALL      = 0x0000FFFE;
export const EXC_MASK_RESOURCE = 0x00002000;
export const EXC_MASK_GUARD    = 0x00004000;
export const EXC_TYPES_COUNT   = 14;

export const VM_REGION_BASIC_INFO_64       = 9;
export const VM_REGION_BASIC_INFO_COUNT_64 = 9;
export const VM_PROT_READ    = 1;
export const VM_PROT_WRITE   = 2;
export const VM_PROT_EXECUTE = 4;

export const MAC_MIN_VM    = 0x0000000001000;
export const MAC_MAX_VM_64 = 0x7FFFFFFF0000;

// proc_pidinfo flavors
export const PROC_PIDT_SHORTBSDINFO = 13;

// sysconf names
export const _SC_PAGESIZE = 29;

// signal numbers (macOS == BSD)
export const SIGTERM = 15;
export const SIGKILL = 9;

// ── Objective-C helpers ──────────────────────────────────────────────

const _classCache = new Map<string, Pointer>();
const _selCache = new Map<string, Pointer>();

export function cls(name: string): Pointer {
  if (_classCache.has(name)) return _classCache.get(name)!;
  const o = objc();
  const F = macFFI();
  if (!o || !F) return null;
  const p = o.objc_getClass(F.ptr(cstr(name)));
  _classCache.set(name, p);
  return p;
}

export function sel(name: string): Pointer {
  if (_selCache.has(name)) return _selCache.get(name)!;
  const o = objc();
  const F = macFFI();
  if (!o || !F) return null;
  const s = o.sel_registerName(F.ptr(cstr(name)));
  _selCache.set(name, s);
  return s;
}

/**
 * Build a typed callable for objc_msgSend with the given signature.
 *
 * Each unique Objective-C method signature we dispatch to needs its own
 * FFI-typed view of `objc_msgSend`.  Bun's `bun:ffi` ties symbol types to
 * the `dlopen()` call rather than to individual invocations, so we re-
 * `dlopen` libobjc with the requested signature and cache the resulting
 * callable by signature key.  This avoids relying on `CFunction({ ptr })`
 * / `symbol.ptr`, which are unreliable across Bun versions.
 */
const _msgSendCache = new Map<string, (...a: any[]) => any>();

export function msgSendTyped(args: number[], returns: number): ((...a: any[]) => any) | null {
  const F = macFFI();
  if (!F) return null;
  const key = args.join(",") + "=>" + returns;
  const cached = _msgSendCache.get(key);
  if (cached) return cached;
  try {
    const lib = F.dlopen<{ objc_msgSend: (...a: any[]) => any }>(
      "/usr/lib/libobjc.A.dylib",
      { objc_msgSend: { args, returns } },
    );
    const fn = lib.symbols.objc_msgSend;
    _msgSendCache.set(key, fn);
    return fn;
  } catch (_) {
    return null;
  }
}

/** Build a CFString from a JS string.  Caller must CFRelease() the result. */
export function cfStringFromJS(s: string): Pointer {
  const C = cf();
  const F = macFFI();
  if (!C || !F) return null;
  return C.CFStringCreateWithCString(null, F.ptr(cstr(s)), kCFStringEncodingUTF8);
}

/** Decode a CFStringRef to JS.  Does not release the CFString. */
export function cfStringToJS(cfstr: Pointer): string {
  const C = cf();
  const F = macFFI();
  if (!C || !F || !cfstr) return "";
  const len = C.CFStringGetLength(cfstr);
  const max = Number(C.CFStringGetMaximumSizeForEncoding(len, kCFStringEncodingUTF8));
  const buf = new Uint8Array(max + 1);
  if (C.CFStringGetCString(cfstr, F.ptr(buf), BigInt(buf.byteLength), kCFStringEncodingUTF8) === 0) return "";
  let end = 0;
  while (end < buf.length && buf[end] !== 0) end++;
  return new TextDecoder("utf-8").decode(buf.subarray(0, end));
}

/** Decode a NUL-terminated byte buffer up to `len` bytes as UTF-8. */
export function bufToStr(buf: Uint8Array, len?: number): string {
  let end = 0;
  const max = len === undefined ? buf.length : Math.min(len, buf.length);
  while (end < max && buf[end] !== 0) end++;
  return new TextDecoder("utf-8").decode(buf.subarray(0, end));
}
