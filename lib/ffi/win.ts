/**
 * Windows FFI helpers shared between subsystems.
 *
 * For keyboard/mouse we use the legacy `keybd_event` / `mouse_event` entry
 * points rather than `SendInput`.  They are documented as superseded but
 * remain functional, and avoid having to lay out the tagged-union INPUT
 * struct from JS.
 */

import { getBunFFI, type BunFFI, type Pointer } from "./bun";

interface User32 {
  keybd_event: (vk: number, scan: number, flags: number, extra: bigint) => void;
  mouse_event: (flags: number, dx: number, dy: number, data: number, extra: bigint) => void;
  GetAsyncKeyState: (vk: number) => number;
  GetCursorPos: (lpPoint: Pointer) => number;
  SetCursorPos: (x: number, y: number) => number;
  GetSystemMetrics: (nIndex: number) => number;
  MapVirtualKeyW: (uCode: number, uMapType: number) => number;
  // Window
  EnumWindows: (lpEnumFunc: Pointer, lParam: bigint) => number;
  IsWindow: (hWnd: bigint) => number;
  IsWindowVisible: (hWnd: bigint) => number;
  IsIconic: (hWnd: bigint) => number;
  IsZoomed: (hWnd: bigint) => number;
  GetWindowTextW: (hWnd: bigint, lpString: Pointer, nMaxCount: number) => number;
  GetWindowTextLengthW: (hWnd: bigint) => number;
  SetWindowTextW: (hWnd: bigint, lpString: Pointer) => number;
  GetWindowThreadProcessId: (hWnd: bigint, lpdwProcessId: Pointer) => number;
  GetWindowRect: (hWnd: bigint, lpRect: Pointer) => number;
  GetClientRect: (hWnd: bigint, lpRect: Pointer) => number;
  ClientToScreen: (hWnd: bigint, lpPoint: Pointer) => number;
  ScreenToClient: (hWnd: bigint, lpPoint: Pointer) => number;
  MoveWindow: (hWnd: bigint, X: number, Y: number, nWidth: number, nHeight: number, bRepaint: number) => number;
  ShowWindow: (hWnd: bigint, nCmdShow: number) => number;
  PostMessageW: (hWnd: bigint, Msg: number, wParam: bigint, lParam: bigint) => number;
  SetForegroundWindow: (hWnd: bigint) => number;
  GetForegroundWindow: () => bigint;
  SetWindowPos: (hWnd: bigint, hWndInsertAfter: bigint, X: number, Y: number, cx: number, cy: number, uFlags: number) => number;
  GetWindowLongW: (hWnd: bigint, nIndex: number) => number;
  SetWindowLongW: (hWnd: bigint, nIndex: number, dwNewLong: number) => number;
  AdjustWindowRectEx: (lpRect: Pointer, dwStyle: number, bMenu: number, dwExStyle: number) => number;
  EnumDisplayMonitors: (hdc: bigint, lprcClip: Pointer, lpfnEnum: Pointer, dwData: bigint) => number;
  GetMonitorInfoW: (hMonitor: bigint, lpmi: Pointer) => number;
  // Clipboard
  OpenClipboard: (hWnd: bigint) => number;
  CloseClipboard: () => number;
  EmptyClipboard: () => number;
  IsClipboardFormatAvailable: (format: number) => number;
  GetClipboardData: (uFormat: number) => bigint;
  SetClipboardData: (uFormat: number, hMem: bigint) => bigint;
  GetClipboardSequenceNumber: () => number;
}

interface Kernel32 {
  GetCurrentProcessId: () => number;
  OpenProcess: (dwDesiredAccess: number, bInheritHandle: number, dwProcessId: number) => bigint;
  CloseHandle: (hObject: bigint) => number;
  GetExitCodeProcess: (hProcess: bigint, lpExitCode: Pointer) => number;
  TerminateProcess: (hProcess: bigint, uExitCode: number) => number;
  IsWow64Process: (hProcess: bigint, Wow64Process: Pointer) => number;
  QueryFullProcessImageNameW: (hProcess: bigint, dwFlags: number, lpExeName: Pointer, lpdwSize: Pointer) => number;
  CheckRemoteDebuggerPresent: (hProcess: bigint, pbDebuggerPresent: Pointer) => number;
  GetSystemInfo: (lpSystemInfo: Pointer) => void;
  GetNativeSystemInfo: (lpSystemInfo: Pointer) => void;
  ReadProcessMemory: (hProcess: bigint, lpBaseAddress: bigint, lpBuffer: Pointer, nSize: bigint, lpNumberOfBytesRead: Pointer) => number;
  WriteProcessMemory: (hProcess: bigint, lpBaseAddress: bigint, lpBuffer: Pointer, nSize: bigint, lpNumberOfBytesWritten: Pointer) => number;
  VirtualQueryEx: (hProcess: bigint, lpAddress: bigint, lpBuffer: Pointer, dwLength: bigint) => bigint;
  VirtualProtectEx: (hProcess: bigint, lpAddress: bigint, dwSize: bigint, flNewProtect: number, lpflOldProtect: Pointer) => number;
  GlobalAlloc: (uFlags: number, dwBytes: bigint) => bigint;
  GlobalFree: (hMem: bigint) => bigint;
  GlobalLock: (hMem: bigint) => bigint;
  GlobalUnlock: (hMem: bigint) => number;
  GlobalSize: (hMem: bigint) => bigint;
  WideCharToMultiByte: (CodePage: number, dwFlags: number, lpWideCharStr: Pointer, cchWideChar: number, lpMultiByteStr: Pointer, cbMultiByte: number, lpDefaultChar: Pointer, lpUsedDefaultChar: Pointer) => number;
  MultiByteToWideChar: (CodePage: number, dwFlags: number, lpMultiByteStr: Pointer, cbMultiByte: number, lpWideCharStr: Pointer, cchWideChar: number) => number;
  lstrlenW: (lpString: Pointer) => number;
}

interface Psapi {
  EnumProcesses: (lpidProcess: Pointer, cb: number, lpcbNeeded: Pointer) => number;
  EnumProcessModulesEx: (hProcess: bigint, lphModule: Pointer, cb: number, lpcbNeeded: Pointer, dwFilterFlag: number) => number;
  GetModuleFileNameExW: (hProcess: bigint, hModule: bigint, lpFilename: Pointer, nSize: number) => number;
  GetModuleInformation: (hProcess: bigint, hModule: bigint, lpmodinfo: Pointer, cb: number) => number;
}

interface Gdi32 {
  CreateCompatibleDC: (hdc: bigint) => bigint;
  CreateCompatibleBitmap: (hdc: bigint, cx: number, cy: number) => bigint;
  SelectObject: (hdc: bigint, h: bigint) => bigint;
  DeleteObject: (ho: bigint) => number;
  DeleteDC: (hdc: bigint) => number;
  BitBlt: (hdc: bigint, x: number, y: number, cx: number, cy: number, hdcSrc: bigint, x1: number, y1: number, rop: number) => number;
  GetDIBits: (hdc: bigint, hbm: bigint, start: number, cLines: number, lpvBits: Pointer, lpbmi: Pointer, usage: number) => number;
  GetDC: (hWnd: bigint) => bigint;
  ReleaseDC: (hWnd: bigint, hDC: bigint) => number;
}

let _opened = false;
let _ffi: BunFFI | null = null;
let _user32: User32 | null = null;
let _kernel32: Kernel32 | null = null;
let _psapi: Psapi | null = null;
let _gdi32: Gdi32 | null = null;

function tryDlopen(): void {
  if (_opened) return;
  _opened = true;
  _ffi = getBunFFI();
  if (!_ffi) return;
  const T = _ffi.FFIType;

  try {
    const lib = _ffi.dlopen<User32>("user32.dll", {
      keybd_event:      { args: [T.u8, T.u8, T.u32, T.u64], returns: T.void },
      mouse_event:      { args: [T.u32, T.i32, T.i32, T.u32, T.u64], returns: T.void },
      GetAsyncKeyState: { args: [T.i32], returns: T.i16 as any },
      GetCursorPos:     { args: [T.ptr], returns: T.i32 },
      SetCursorPos:     { args: [T.i32, T.i32], returns: T.i32 },
      GetSystemMetrics: { args: [T.i32], returns: T.i32 },
      MapVirtualKeyW:   { args: [T.u32, T.u32], returns: T.u32 },
      EnumWindows:               { args: [T.ptr, T.u64], returns: T.i32 },
      IsWindow:                  { args: [T.u64], returns: T.i32 },
      IsWindowVisible:           { args: [T.u64], returns: T.i32 },
      IsIconic:                  { args: [T.u64], returns: T.i32 },
      IsZoomed:                  { args: [T.u64], returns: T.i32 },
      GetWindowTextW:            { args: [T.u64, T.ptr, T.i32], returns: T.i32 },
      GetWindowTextLengthW:      { args: [T.u64], returns: T.i32 },
      SetWindowTextW:            { args: [T.u64, T.ptr], returns: T.i32 },
      GetWindowThreadProcessId:  { args: [T.u64, T.ptr], returns: T.u32 },
      GetWindowRect:             { args: [T.u64, T.ptr], returns: T.i32 },
      GetClientRect:             { args: [T.u64, T.ptr], returns: T.i32 },
      ClientToScreen:            { args: [T.u64, T.ptr], returns: T.i32 },
      ScreenToClient:            { args: [T.u64, T.ptr], returns: T.i32 },
      MoveWindow:                { args: [T.u64, T.i32, T.i32, T.i32, T.i32, T.i32], returns: T.i32 },
      ShowWindow:                { args: [T.u64, T.i32], returns: T.i32 },
      PostMessageW:              { args: [T.u64, T.u32, T.u64, T.u64], returns: T.i32 },
      SetForegroundWindow:       { args: [T.u64], returns: T.i32 },
      GetForegroundWindow:       { args: [], returns: T.u64 },
      SetWindowPos:              { args: [T.u64, T.u64, T.i32, T.i32, T.i32, T.i32, T.u32], returns: T.i32 },
      GetWindowLongW:            { args: [T.u64, T.i32], returns: T.i32 },
      SetWindowLongW:            { args: [T.u64, T.i32, T.i32], returns: T.i32 },
      AdjustWindowRectEx:        { args: [T.ptr, T.u32, T.i32, T.u32], returns: T.i32 },
      EnumDisplayMonitors:       { args: [T.u64, T.ptr, T.ptr, T.u64], returns: T.i32 },
      GetMonitorInfoW:           { args: [T.u64, T.ptr], returns: T.i32 },
      OpenClipboard:             { args: [T.u64], returns: T.i32 },
      CloseClipboard:            { args: [], returns: T.i32 },
      EmptyClipboard:            { args: [], returns: T.i32 },
      IsClipboardFormatAvailable:{ args: [T.u32], returns: T.i32 },
      GetClipboardData:          { args: [T.u32], returns: T.u64 },
      SetClipboardData:          { args: [T.u32, T.u64], returns: T.u64 },
      GetClipboardSequenceNumber:{ args: [], returns: T.u32 },
    });
    _user32 = lib.symbols;
  } catch (_) {
    _user32 = null;
  }

  try {
    const lib = _ffi.dlopen<Kernel32>("kernel32.dll", {
      GetCurrentProcessId:        { args: [], returns: T.u32 },
      OpenProcess:                { args: [T.u32, T.i32, T.u32], returns: T.u64 },
      CloseHandle:                { args: [T.u64], returns: T.i32 },
      GetExitCodeProcess:         { args: [T.u64, T.ptr], returns: T.i32 },
      TerminateProcess:           { args: [T.u64, T.u32], returns: T.i32 },
      IsWow64Process:             { args: [T.u64, T.ptr], returns: T.i32 },
      QueryFullProcessImageNameW: { args: [T.u64, T.u32, T.ptr, T.ptr], returns: T.i32 },
      CheckRemoteDebuggerPresent: { args: [T.u64, T.ptr], returns: T.i32 },
      GetSystemInfo:              { args: [T.ptr], returns: T.void },
      GetNativeSystemInfo:        { args: [T.ptr], returns: T.void },
      ReadProcessMemory:          { args: [T.u64, T.u64, T.ptr, T.u64, T.ptr], returns: T.i32 },
      WriteProcessMemory:         { args: [T.u64, T.u64, T.ptr, T.u64, T.ptr], returns: T.i32 },
      VirtualQueryEx:             { args: [T.u64, T.u64, T.ptr, T.u64], returns: T.u64 },
      VirtualProtectEx:           { args: [T.u64, T.u64, T.u64, T.u32, T.ptr], returns: T.i32 },
      GlobalAlloc:                { args: [T.u32, T.u64], returns: T.u64 },
      GlobalFree:                 { args: [T.u64], returns: T.u64 },
      GlobalLock:                 { args: [T.u64], returns: T.u64 },
      GlobalUnlock:               { args: [T.u64], returns: T.i32 },
      GlobalSize:                 { args: [T.u64], returns: T.u64 },
      WideCharToMultiByte:        { args: [T.u32, T.u32, T.ptr, T.i32, T.ptr, T.i32, T.ptr, T.ptr], returns: T.i32 },
      MultiByteToWideChar:        { args: [T.u32, T.u32, T.ptr, T.i32, T.ptr, T.i32], returns: T.i32 },
      lstrlenW:                   { args: [T.ptr], returns: T.i32 },
    });
    _kernel32 = lib.symbols;
  } catch (_) {
    _kernel32 = null;
  }

  try {
    const lib = _ffi.dlopen<Psapi>("psapi.dll", {
      EnumProcesses:        { args: [T.ptr, T.u32, T.ptr], returns: T.i32 },
      EnumProcessModulesEx: { args: [T.u64, T.ptr, T.u32, T.ptr, T.u32], returns: T.i32 },
      GetModuleFileNameExW: { args: [T.u64, T.u64, T.ptr, T.u32], returns: T.u32 },
      GetModuleInformation: { args: [T.u64, T.u64, T.ptr, T.u32], returns: T.i32 },
    });
    _psapi = lib.symbols;
  } catch (_) {
    _psapi = null;
  }

  try {
    const lib = _ffi.dlopen<Gdi32>("gdi32.dll", {
      CreateCompatibleDC:     { args: [T.u64], returns: T.u64 },
      CreateCompatibleBitmap: { args: [T.u64, T.i32, T.i32], returns: T.u64 },
      SelectObject:           { args: [T.u64, T.u64], returns: T.u64 },
      DeleteObject:           { args: [T.u64], returns: T.i32 },
      DeleteDC:               { args: [T.u64], returns: T.i32 },
      BitBlt:                 { args: [T.u64, T.i32, T.i32, T.i32, T.i32, T.u64, T.i32, T.i32, T.u32], returns: T.i32 },
      GetDIBits:              { args: [T.u64, T.u64, T.u32, T.u32, T.ptr, T.ptr, T.u32], returns: T.i32 },
      GetDC:                  { args: [T.u64], returns: T.u64 },
      ReleaseDC:              { args: [T.u64, T.u64], returns: T.i32 },
    });
    _gdi32 = lib.symbols;
  } catch (_) {
    _gdi32 = null;
  }
}

export function user32(): User32 | null {
  tryDlopen();
  return _user32;
}

export function kernel32(): Kernel32 | null {
  tryDlopen();
  return _kernel32;
}

export function psapi(): Psapi | null {
  tryDlopen();
  return _psapi;
}

export function gdi32(): Gdi32 | null {
  tryDlopen();
  return _gdi32;
}

export function winFFI(): BunFFI | null {
  tryDlopen();
  return _ffi;
}

// Convert UTF-16LE buffer to JS string
export function w2js(buf: Uint16Array, len?: number): string {
  if (len === undefined) {
    len = 0;
    while (len < buf.length && buf[len] !== 0) len++;
  }
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(buf[i]);
  return s;
}

// Encode JS string as NUL-terminated UTF-16LE Uint16Array
export function js2w(s: string): Uint16Array {
  const buf = new Uint16Array(s.length + 1);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
  buf[s.length] = 0;
  return buf;
}

// keybd_event flags
export const KEYEVENTF_KEYUP = 0x0002;

// mouse_event flags
export const MOUSEEVENTF_LEFTDOWN   = 0x0002;
export const MOUSEEVENTF_LEFTUP     = 0x0004;
export const MOUSEEVENTF_RIGHTDOWN  = 0x0008;
export const MOUSEEVENTF_RIGHTUP    = 0x0010;
export const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
export const MOUSEEVENTF_MIDDLEUP   = 0x0040;
export const MOUSEEVENTF_XDOWN      = 0x0080;
export const MOUSEEVENTF_XUP        = 0x0100;
export const MOUSEEVENTF_WHEEL      = 0x0800;
export const MOUSEEVENTF_HWHEEL     = 0x1000;

export const XBUTTON1 = 1;
export const XBUTTON2 = 2;
export const WHEEL_DELTA = 120;

// VK codes used here
export const VK_LBUTTON  = 0x01;
export const VK_RBUTTON  = 0x02;
export const VK_MBUTTON  = 0x04;
export const VK_XBUTTON1 = 0x05;
export const VK_XBUTTON2 = 0x06;

// GetSystemMetrics index
export const SM_SWAPBUTTON = 23;

// MapVirtualKey type
export const MAPVK_VK_TO_VSC = 0;
