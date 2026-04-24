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

import { getBunFFI, bp, cstr, cstrCached, type BunFFI, type Pointer } from "./bun";

// ── Interfaces ────────────────────────────────────────────────────────

interface CoreGraphics {
  // Event sources + keyboard/mouse events
  CGEventSourceCreate: (stateID: number) => bigint;
  CGEventCreate: (source: bigint) => bigint;
  CGEventCreateKeyboardEvent: (source: bigint, vk: number, keyDown: boolean) => bigint;
  CGEventCreateMouseEvent: (source: bigint, type: number, x: number, y: number, button: number) => bigint;
  CGEventCreateScrollWheelEvent2: (source: bigint, units: number, wheelCount: number, w1: number, w2: number, w3: number) => bigint;
  CGEventPost: (tap: number, event: bigint) => void;
  CGEventSourceKeyState: (stateID: number, key: number) => boolean;
  CGEventSourceButtonState: (stateID: number, button: number) => boolean;
  CGEventSetType: (event: bigint, type: number) => void;
  CGEventSetIntegerValueField: (event: bigint, field: number, value: bigint) => void;
  // Cursor
  CGWarpMouseCursorPosition: (x: number, y: number) => number;
  CGAssociateMouseAndMouseCursorPosition: (connected: boolean) => number;
  // Displays
  CGMainDisplayID: () => number;
  CGGetActiveDisplayList: (max: number, displays: bigint, count: bigint) => number;
  CGDisplayPixelsWide: (id: number) => bigint;
  CGDisplayPixelsHigh: (id: number) => bigint;
  CGDisplayIsActive: (id: number) => boolean;
  CGDisplayCreateImage: (id: number) => bigint;
  // Bitmap / image
  CGBitmapContextCreate: (
    data: bigint, width: bigint, height: bigint,
    bitsPerComponent: bigint, bytesPerRow: bigint,
    space: bigint, bitmapInfo: number,
  ) => bigint;
  CGBitmapContextGetData: (ctx: bigint) => bigint;
  CGBitmapContextCreateImage: (ctx: bigint) => bigint;
  CGContextDrawImage: (ctx: bigint, rx: number, ry: number, rw: number, rh: number, image: bigint) => void;
  CGContextRelease: (ctx: bigint) => void;
  CGImageRelease: (image: bigint) => void;
  CGImageGetWidth: (image: bigint) => bigint;
  CGImageGetHeight: (image: bigint) => bigint;
  CGColorSpaceCreateDeviceRGB: () => bigint;
  CGColorSpaceRelease: (space: bigint) => void;
  // Window list
  CGWindowListCopyWindowInfo: (option: number, relativeToWindow: number) => bigint;
}

interface CoreFoundation {
  CFRelease: (cf: bigint) => void;
  CFStringCreateMutable: (alloc: bigint, maxLength: bigint) => bigint;
  CFStringAppendCString: (s: bigint, cstr: bigint, encoding: number) => void;
  CFStringGetCString: (s: bigint, buf: bigint, size: bigint, encoding: number) => number;
  CFStringGetLength: (s: bigint) => bigint;
  CFStringGetMaximumSizeForEncoding: (len: bigint, encoding: number) => bigint;
  CFArrayGetCount: (theArray: bigint) => bigint;
  CFArrayGetValueAtIndex: (theArray: bigint, idx: bigint) => bigint;
  CFDictionaryGetValue: (theDict: bigint, key: bigint) => bigint;
  CFNumberGetValue: (cfNum: bigint, theType: bigint, valuePtr: bigint) => number;
  CFBooleanGetValue: (boolean: bigint) => number;
  CFNumberCreate: (alloc: bigint, theType: bigint, valuePtr: bigint) => bigint;
}

interface Accessibility {
  AXIsProcessTrusted: () => number;
  AXUIElementCreateApplication: (pid: number) => bigint;
  AXUIElementCreateSystemWide: () => bigint;
  AXUIElementCopyAttributeValue: (elem: bigint, attr: bigint, value: bigint) => number;
  AXUIElementSetAttributeValue: (elem: bigint, attr: bigint, value: bigint) => number;
  AXUIElementPerformAction: (elem: bigint, action: bigint) => number;
  _AXUIElementGetWindow: (elem: bigint, wid: bigint) => number;
  AXValueCreate: (type: number, value: bigint) => bigint;
  AXValueGetValue: (value: bigint, type: number, out: bigint) => number;
}

interface Objc {
  objc_getClass: (name: bigint) => bigint;
  sel_registerName: (name: bigint) => bigint;
  /** Base pointer to objc_msgSend; wrap with CFunction per call site. */
  objc_msgSend: (receiver: bigint, selector: bigint) => bigint;
  objc_autoreleasePoolPush: () => bigint;
  objc_autoreleasePoolPop: (pool: bigint) => void;
}

interface Libc {
  // libproc
  proc_pidpath: (pid: number, buf: bigint, bufsize: number) => number;
  proc_name: (pid: number, buf: bigint, bufsize: number) => number;
  proc_listallpids: (buf: bigint, bufsize: number) => number;
  proc_pidinfo: (pid: number, flavor: number, arg: bigint, buf: bigint, bufsize: number) => number;
  // POSIX
  kill: (pid: number, sig: number) => number;
  sysconf: (name: number) => bigint;
  getpid: () => number;
  realpath: (path: bigint, resolved: bigint) => bigint;
  // mach
  mach_task_self: () => number;
  task_for_pid: (target_tport: number, pid: number, t: bigint) => number;
  mach_vm_read_overwrite: (target: number, addr: bigint, size: bigint, data: bigint, outsize: bigint) => number;
  mach_vm_write: (target: number, addr: bigint, data: bigint, cnt: number) => number;
  mach_vm_protect: (target: number, addr: bigint, size: bigint, setMax: number, newProt: number) => number;
  mach_vm_region: (target: number, addr: bigint, size: bigint, flavor: number, info: bigint, cnt: bigint, obj: bigint) => number;
  task_info: (target: number, flavor: number, info: bigint, cnt: bigint) => number;
  task_get_exception_ports: (
    task: number, mask: number,
    masks: bigint, cnt: bigint,
    ports: bigint, behaviors: bigint, flavors: bigint,
  ) => number;
  uname: (buf: bigint) => number;
  free: (ptr: bigint) => void;
  // dynamic-loader lookup — needed to resolve DATA symbols like
  // NSPasteboardTypeString (bun:ffi.dlopen wraps only function symbols).
  dlopen: (path: bigint, flags: number) => bigint;
  dlsym: (handle: bigint, name: bigint) => bigint;
}

// ── Paths ─────────────────────────────────────────────────────────────

const AK_PATH = "/System/Library/Frameworks/AppKit.framework/AppKit";

// ── State ─────────────────────────────────────────────────────────────

let _opened = false;
let _ffi: BunFFI | null = null;
let _cg: CoreGraphics | null = null;
let _cf: CoreFoundation | null = null;
let _objc: Objc | null = null;
let _libc: Libc | null = null;
let _ax: Accessibility | null = null;
let _appkitLoaded = false;

// Prevent GC from collecting DlopenResult objects — Bun 1.3.13 frees
// JIT thunks on finalization, corrupting function pointers we still use.
const _dlopenHandles: any[] = [];

// ── Load ──────────────────────────────────────────────────────────────

function tryDlopen(): void {
  if (_opened) return;
  _opened = true;
  _ffi = getBunFFI();
  if (!_ffi) return;
  if (process.platform !== "darwin") return;
  const T = _ffi.FFIType;
  // AK_PATH is file-scope (referenced by resolveDataSymbol too).

  const CG_PATH = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";
  const CF_PATH = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
  const OBJC_PATH = "/usr/lib/libobjc.A.dylib";
  const LIBC_PATH = "/usr/lib/libSystem.B.dylib";

  try {
    const lib = _ffi.dlopen<CoreGraphics>(CG_PATH, {
      CGEventSourceCreate:                  { args: [T.u32], returns: T.i64 },
      CGEventCreate:                        { args: [T.i64], returns: T.i64 },
      CGEventCreateKeyboardEvent:           { args: [T.i64, T.u16, T.bool], returns: T.i64 },
      // CGPoint passed as two f64s (SysV/AAPCS HFA or separate args — same ABI).
      CGEventCreateMouseEvent:              { args: [T.i64, T.u32, T.f64, T.f64, T.u32], returns: T.i64 },
      // Non-variadic scroll helper — bun:ffi can't dispatch to variadics.
      CGEventCreateScrollWheelEvent2:       { args: [T.i64, T.u32, T.u32, T.i32, T.i32, T.i32], returns: T.i64 },
      CGEventPost:                          { args: [T.u32, T.i64], returns: T.void },
      CGEventSourceKeyState:                { args: [T.u32, T.u16], returns: T.bool },
      CGEventSourceButtonState:             { args: [T.u32, T.u32], returns: T.bool },
      CGEventSetType:                       { args: [T.i64, T.u32], returns: T.void },
      CGEventSetIntegerValueField:          { args: [T.i64, T.u32, T.i64], returns: T.void },
      CGWarpMouseCursorPosition:            { args: [T.f64, T.f64], returns: T.i32 },
      CGAssociateMouseAndMouseCursorPosition: { args: [T.bool], returns: T.i32 },
      CGMainDisplayID:                      { args: [], returns: T.u32 },
      CGGetActiveDisplayList:               { args: [T.u32, T.i64, T.i64], returns: T.i32 },
      CGDisplayPixelsWide:                  { args: [T.u32], returns: T.u64 },
      CGDisplayPixelsHigh:                  { args: [T.u32], returns: T.u64 },
      CGDisplayIsActive:                    { args: [T.u32], returns: T.bool },
      CGDisplayCreateImage:                 { args: [T.u32], returns: T.i64 },
      CGBitmapContextCreate:                { args: [T.i64, T.u64, T.u64, T.u64, T.u64, T.i64, T.u32], returns: T.i64 },
      CGBitmapContextGetData:               { args: [T.i64], returns: T.i64 },
      CGBitmapContextCreateImage:           { args: [T.i64], returns: T.i64 },
      // CGRect passed as 4 f64 args.
      CGContextDrawImage:                   { args: [T.i64, T.f64, T.f64, T.f64, T.f64, T.i64], returns: T.void },
      CGContextRelease:                     { args: [T.i64], returns: T.void },
      CGImageRelease:                       { args: [T.i64], returns: T.void },
      CGImageGetWidth:                      { args: [T.i64], returns: T.u64 },
      CGImageGetHeight:                     { args: [T.i64], returns: T.u64 },
      CGColorSpaceCreateDeviceRGB:          { args: [], returns: T.i64 },
      CGColorSpaceRelease:                  { args: [T.i64], returns: T.void },
      // CGWindowListOption (uint32_t), CGWindowID (uint32_t) → CFArrayRef
      CGWindowListCopyWindowInfo:           { args: [T.u32, T.u32], returns: T.i64 },
    });
    _cg = lib.symbols;
    _dlopenHandles.push(lib);
  } catch (_) { _cg = null; }

  try {
    const lib = _ffi.dlopen<CoreFoundation>(CF_PATH, {
      CFRelease:                          { args: [T.i64], returns: T.void },
      CFStringCreateMutable:              { args: [T.i64, T.i64], returns: T.i64 },
      CFStringAppendCString:              { args: [T.i64, T.i64, T.u32], returns: T.void },
      // i64 first arg so tagged CFString pointers pass through.
      CFStringGetCString:                 { args: [T.i64, T.i64, T.i64, T.u32], returns: T.i32 },
      CFStringGetLength:                  { args: [T.i64], returns: T.i64 },
      CFStringGetMaximumSizeForEncoding:  { args: [T.i64, T.u32], returns: T.i64 },
      // CFIndex CFArrayGetCount(CFArrayRef) — CFIndex is signed long (i64 on 64-bit)
      CFArrayGetCount:                    { args: [T.i64], returns: T.i64 },
      // const void * CFArrayGetValueAtIndex(CFArrayRef, CFIndex)
      CFArrayGetValueAtIndex:             { args: [T.i64, T.i64], returns: T.i64 },
      // const void * CFDictionaryGetValue(CFDictionaryRef, const void *key)
      // Returns T.i64 — tagged pointers have the high bit set; i64 lets the
      // signed bigint flow directly to other i64-typed args without the
      // "Unable to convert … to a pointer" rejection that T.i64 causes.
      CFDictionaryGetValue:               { args: [T.i64, T.i64], returns: T.i64 },
      // Boolean CFNumberGetValue(CFNumberRef, CFNumberType, void *) — Boolean is unsigned char (u8)
      // First arg is i64 (not ptr) so tagged CFNumber pointers pass through.
      CFNumberGetValue:                   { args: [T.i64, T.i64, T.i64], returns: T.u8 },
      CFBooleanGetValue:                  { args: [T.i64], returns: T.u8 },
      CFNumberCreate:                     { args: [T.i64, T.i64, T.i64], returns: T.i64 },
    });
    _cf = lib.symbols;
    _dlopenHandles.push(lib);
  } catch (_) { _cf = null; }

  try {
    const lib = _ffi.dlopen<Objc>(OBJC_PATH, {
      objc_getClass:              { args: [T.i64], returns: T.i64 },
      sel_registerName:           { args: [T.i64], returns: T.i64 },
      // Generic 0-arg msgSend.  Typed per-signature wrappers are built
      // on demand via `msgSendTyped()` which re-dlopens objc_msgSend.
      objc_msgSend:               { args: [T.i64, T.i64], returns: T.i64 },
      objc_autoreleasePoolPush:   { args: [], returns: T.i64 },
      objc_autoreleasePoolPop:    { args: [T.i64], returns: T.void },
    });
    _objc = lib.symbols;
    _dlopenHandles.push(lib);
  } catch (_) { _objc = null; }

  // We dlopen AppKit only so the Objective-C runtime loads its classes
  // (NSPasteboard, NSImage, etc.) and `objc_getClass("NSPasteboard")`
  // succeeds.  `bun:ffi.dlopen` requires at least one symbol to look up,
  // so we ask for `NSBeep` — a stable plain-C function the framework has
  // always exported.  We never actually call it.
  try {
    const akLib = _ffi.dlopen<{ NSBeep: () => void }>(AK_PATH, {
      NSBeep: { args: [], returns: T.void },
    });
    _dlopenHandles.push(akLib);
    _appkitLoaded = true;
  } catch (_) { _appkitLoaded = false; }

  try {
    const lib = _ffi.dlopen<Libc>(LIBC_PATH, {
      proc_pidpath:                 { args: [T.i32, T.i64, T.u32], returns: T.i32 },
      proc_name:                    { args: [T.i32, T.i64, T.u32], returns: T.i32 },
      proc_listallpids:             { args: [T.i64, T.i32], returns: T.i32 },
      proc_pidinfo:                 { args: [T.i32, T.i32, T.u64, T.i64, T.i32], returns: T.i32 },
      kill:                         { args: [T.i32, T.i32], returns: T.i32 },
      sysconf:                      { args: [T.i32], returns: T.i64 },
      getpid:                       { args: [], returns: T.i32 },
      realpath:                     { args: [T.i64, T.i64], returns: T.i64 },
      mach_task_self:               { args: [], returns: T.u32 },
      task_for_pid:                 { args: [T.u32, T.i32, T.i64], returns: T.i32 },
      mach_vm_read_overwrite:       { args: [T.u32, T.u64, T.u64, T.u64, T.i64], returns: T.i32 },
      mach_vm_write:                { args: [T.u32, T.u64, T.u64, T.u32], returns: T.i32 },
      mach_vm_protect:              { args: [T.u32, T.u64, T.u64, T.i32, T.i32], returns: T.i32 },
      mach_vm_region:               { args: [T.u32, T.i64, T.i64, T.i32, T.i64, T.i64, T.i64], returns: T.i32 },
      task_info:                    { args: [T.u32, T.u32, T.i64, T.i64], returns: T.i32 },
      task_get_exception_ports:     { args: [T.u32, T.u32, T.i64, T.i64, T.i64, T.i64, T.i64], returns: T.i32 },
      uname:                        { args: [T.i64], returns: T.i32 },
      free:                         { args: [T.i64], returns: T.void },
      dlopen:                       { args: [T.i64, T.i32], returns: T.i64 },
      dlsym:                        { args: [T.i64, T.i64], returns: T.i64 },
    });
    _libc = lib.symbols;
    _dlopenHandles.push(lib);
  } catch (_) { _libc = null; }

  const AX_PATH = "/System/Library/Frameworks/ApplicationServices.framework/Frameworks/HIServices.framework/HIServices";
  try {
    const lib = _ffi.dlopen<Accessibility>(AX_PATH, {
      AXIsProcessTrusted:              { args: [], returns: T.u8 },
      AXUIElementCreateApplication:    { args: [T.i32], returns: T.i64 },
      AXUIElementCreateSystemWide:     { args: [], returns: T.i64 },
      AXUIElementCopyAttributeValue:   { args: [T.i64, T.i64, T.i64], returns: T.i32 },
      AXUIElementSetAttributeValue:    { args: [T.i64, T.i64, T.i64], returns: T.i32 },
      AXUIElementPerformAction:        { args: [T.i64, T.i64], returns: T.i32 },
      _AXUIElementGetWindow:           { args: [T.i64, T.i64], returns: T.i32 },
      AXValueCreate:                   { args: [T.u32, T.i64], returns: T.i64 },
      AXValueGetValue:                 { args: [T.i64, T.u32, T.i64], returns: T.u8 },
    });
    _ax = lib.symbols;
    _dlopenHandles.push(lib);
  } catch (_) { _ax = null; }
}

// ── Public accessors ──────────────────────────────────────────────────

export function cg(): CoreGraphics | null { tryDlopen(); return _cg; }
export function cf(): CoreFoundation | null { tryDlopen(); return _cf; }
export function objc(): Objc | null { tryDlopen(); return _objc; }
export function libc(): Libc | null { tryDlopen(); return _libc; }
export function ax(): Accessibility | null { tryDlopen(); return _ax; }
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

// CGWindowListCopyWindowInfo option flags
export const kCGWindowListOptionOnScreenOnly = 1 << 0;
export const kCGWindowListExcludeDesktopElements = 1 << 4;
export const kCGNullWindowID = 0;

// CGImage bitmap info: little-endian 32-bit BGRA, premultiplied-first alpha.
// Equivalent to (kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst).
export const BITMAP_INFO_BGRA_PMA = (2 << 12) | 2;

// kCFStringEncodingUTF8
export const kCFStringEncodingUTF8 = 0x08000100;

// kCFNumberSInt32Type
export const kCFNumberSInt32Type = 3;
export const kCFNumberFloat64Type = 13;

// AXValue types
export const kAXValueCGPointType = 1;
export const kAXValueCGSizeType = 2;

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

const _classCache = new Map<string, bigint>();
const _selCache = new Map<string, bigint>();

export function cls(name: string): bigint {
  const cached = _classCache.get(name);
  if (cached !== undefined) return cached;
  const o = objc();
  const F = macFFI();
  if (!o || !F) return 0n;
  const p = o.objc_getClass(bp(cstrCached(name)));
  _classCache.set(name, p);
  return p;
}

export function sel(name: string): bigint {
  const cached = _selCache.get(name);
  if (cached !== undefined) return cached;
  const o = objc();
  const F = macFFI();
  if (!o || !F) return 0n;
  const s = o.sel_registerName(bp(cstrCached(name)));
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

    _dlopenHandles.push(lib);
    const fn = lib.symbols.objc_msgSend;
    _msgSendCache.set(key, fn);
    return fn;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve a DATA symbol (e.g. `NSPasteboardTypeString`) from a loaded
 * dylib and return the pointer value stored at it.  `bun:ffi.dlopen`
 * only wraps function symbols, so we call `dlsym` directly.
 *
 * We can't use RTLD_DEFAULT as the handle: that's `(void *)-2`, whose
 * 64-bit unsigned value (2^64-2) is above 2^63 and bun:ffi's T.i64
 * bigint-to-pointer conversion rejects it with "Unable to convert … to
 * a pointer".  Instead, dlopen the containing dylib to get a real
 * heap-range handle and dlsym against that.
 */
const RTLD_LAZY = 1;
let _appkitHandle = 0n;
const _dataSymCache = new Map<string, bigint>();
export function resolveDataSymbol(name: string): bigint {
  const cached = _dataSymCache.get(name);
  if (cached !== undefined) return cached;
  const lc = libc();
  const F = macFFI();
  if (!lc || !F) return 0n;
  if (!_appkitHandle) {
    _appkitHandle = lc.dlopen(bp(cstr(AK_PATH)), RTLD_LAZY);
    if (!_appkitHandle) { _dataSymCache.set(name, 0n); return 0n; }
  }
  const addr = lc.dlsym(_appkitHandle, bp(cstr(name)));
  if (!addr) { _dataSymCache.set(name, 0n); return 0n; }
  const val = F.read.ptr(Number(addr));
  const ptr = typeof val === "bigint" ? val : BigInt(val as number);
  _dataSymCache.set(name, ptr);
  return ptr;
}

/**
 * Build a CFString from a JS string.  Caller must CFRelease() the result.
 *
 * We deliberately avoid `CFStringCreateWithCString`, which returns a
 * *tagged pointer* for short ASCII strings on arm64 Darwin.
 * `CFStringCreateMutable` always returns a heap-allocated object.
 */
export function cfStringFromJS(s: string): bigint {
  const C = cf();
  if (!C) return 0n;
  const m = C.CFStringCreateMutable(0n, 0n);
  if (!m) return 0n;
  C.CFStringAppendCString(m, bp(cstrCached(s)), kCFStringEncodingUTF8);
  return m;
}

/**
 * Decode a CFStringRef to JS.  Does not release the CFString.
 * Accepts bigint (i64) so tagged CFString pointers pass through.
 */
let _cfStrBuf = new Uint8Array(256);
const _utf8Dec = new TextDecoder("utf-8");

export function cfStringToJS(cfstr: bigint): string {
  const C = cf();
  const F = macFFI();
  if (!C || !F || !cfstr) return "";
  const len = C.CFStringGetLength(cfstr);
  const need = Number(C.CFStringGetMaximumSizeForEncoding(len, kCFStringEncodingUTF8)) + 1;
  if (need > _cfStrBuf.length) _cfStrBuf = new Uint8Array(need);
  if (C.CFStringGetCString(cfstr, bp(_cfStrBuf), BigInt(_cfStrBuf.byteLength), kCFStringEncodingUTF8) === 0) return "";
  let end = 0;
  while (end < _cfStrBuf.length && _cfStrBuf[end] !== 0) end++;
  return _utf8Dec.decode(_cfStrBuf.subarray(0, end));
}

/** Decode a NUL-terminated byte buffer up to `len` bytes as UTF-8. */
export function bufToStr(buf: Uint8Array, len?: number): string {
  let end = 0;
  const max = len === undefined ? buf.length : Math.min(len, buf.length);
  while (end < max && buf[end] !== 0) end++;
  return new TextDecoder("utf-8").decode(buf.subarray(0, end));
}

let _cfBoolTrue = 0n;
let _cfBoolFalse = 0n;
let _cfBoolInit = false;

/**
 * Return the kCFBooleanTrue or kCFBooleanFalse singleton.
 *
 * Resolved via dlsym at first call.  The symbol address (a dlsym result)
 * is a code/data-segment virtual address — Number() conversion is safe
 * because bun:ffi's read.ptr requires a JS number and VA ranges on
 * current macOS hardware are well within Number precision.
 */
export function cfBool(v: boolean): bigint {
  if (!_cfBoolInit) {
    _cfBoolInit = true;
    const lc = libc();
    const F = macFFI();
    if (!lc || !F) return 0n;
    const CF_PATH = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
    const handle = lc.dlopen(bp(cstr(CF_PATH)), 1);
    if (!handle) return 0n;
    for (const [name, set] of [["kCFBooleanTrue", true], ["kCFBooleanFalse", false]] as const) {
      const addr = lc.dlsym(handle, bp(cstr(name)));
      if (!addr) continue;
      const val = F.read.ptr(Number(addr));
      const ptr = typeof val === "bigint" ? val : BigInt(val as number);
      if (set) _cfBoolTrue = ptr; else _cfBoolFalse = ptr;
    }
  }
  return v ? _cfBoolTrue : _cfBoolFalse;
}
