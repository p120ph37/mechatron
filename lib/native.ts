export interface NativeBackend {
  // Keyboard
  keyboard_click(keycode: number): void;
  keyboard_press(keycode: number): void;
  keyboard_release(keycode: number): void;
  keyboard_compile(keys: string): Array<{ down: boolean; key: number }>;
  keyboard_getState(): Record<number, boolean>;
  keyboard_getKeyState(keycode: number): boolean;

  // Mouse
  mouse_click(button: number): void;
  mouse_press(button: number): void;
  mouse_release(button: number): void;
  mouse_scrollH(amount: number): void;
  mouse_scrollV(amount: number): void;
  mouse_getPos(): { x: number; y: number };
  mouse_setPos(x: number, y: number): void;
  mouse_getState(): Record<number, boolean>;
  mouse_getButtonState(button: number): boolean;

  // Clipboard
  clipboard_clear(): boolean;
  clipboard_hasText(): boolean;
  clipboard_getText(): string;
  clipboard_setText(text: string): boolean;
  clipboard_hasImage(): boolean;
  clipboard_getImage(): { width: number; height: number; data: Uint32Array } | null;
  clipboard_setImage(width: number, height: number, data: Uint32Array): boolean;
  clipboard_getSequence(): number;

  // Screen
  screen_synchronize(): Array<{ bounds: { x: number; y: number; w: number; h: number }; usable: { x: number; y: number; w: number; h: number } }> | null;
  screen_grabScreen(x: number, y: number, w: number, h: number, windowHandle?: number): Uint32Array | null;
  screen_isCompositing(): boolean;
  screen_setCompositing(enabled: boolean): void;
  screen_getTotalBounds(): { x: number; y: number; w: number; h: number };
  screen_getTotalUsable(): { x: number; y: number; w: number; h: number };

  // Window
  window_isValid(handle: number): boolean;
  window_close(handle: number): void;
  window_isTopMost(handle: number): boolean;
  window_isBorderless(handle: number): boolean;
  window_isMinimized(handle: number): boolean;
  window_isMaximized(handle: number): boolean;
  window_setTopMost(handle: number, topMost: boolean): void;
  window_setBorderless(handle: number, borderless: boolean): void;
  window_setMinimized(handle: number, minimized: boolean): void;
  window_setMaximized(handle: number, maximized: boolean): void;
  window_getProcess(handle: number): number;  // returns PID
  window_getPID(handle: number): number;
  window_getHandle(handle: number): number;
  window_setHandle(handle: number, newHandle: number): boolean;
  window_getTitle(handle: number): string;
  window_setTitle(handle: number, title: string): void;
  window_getBounds(handle: number): { x: number; y: number; w: number; h: number };
  window_setBounds(handle: number, x: number, y: number, w: number, h: number): void;
  window_getClient(handle: number): { x: number; y: number; w: number; h: number };
  window_setClient(handle: number, x: number, y: number, w: number, h: number): void;
  window_mapToClient(handle: number, x: number, y: number): { x: number; y: number };
  window_mapToScreen(handle: number, x: number, y: number): { x: number; y: number };
  window_getList(regex?: string): number[];  // returns array of handles
  window_getActive(): number;
  window_setActive(handle: number): void;
  window_isAxEnabled(prompt?: boolean): boolean;

  // Process
  process_open(pid: number): boolean;
  process_close(pid: number): void;
  process_isValid(pid: number): boolean;
  process_is64Bit(pid: number): boolean;
  process_isDebugged(pid: number): boolean;
  process_getPID(pid: number): number;
  process_getName(pid: number): string;
  process_getPath(pid: number): string;
  process_exit(pid: number): void;
  process_kill(pid: number): void;
  process_hasExited(pid: number): boolean;
  process_getModules(pid: number, regex?: string): Array<{ valid: boolean; name: string; path: string; base: number; size: number; pid: number }>;
  process_getWindows(pid: number, regex?: string): number[];  // returns window handles
  process_getList(regex?: string): number[];  // returns PIDs
  process_getCurrent(): number;  // returns PID
  process_isSys64Bit(): boolean;
  process_getSegments(pid: number, base: number): Array<{ valid: boolean; base: number; size: number; name: string }>;

  // Memory
  memory_isValid(pid: number): boolean;
  memory_getRegion(pid: number, address: number): { valid: boolean; bound: boolean; start: number; stop: number; size: number; readable: boolean; writable: boolean; executable: boolean; access: number; private: boolean; guarded: boolean };
  memory_getRegions(pid: number, start?: number, stop?: number): Array<{ valid: boolean; bound: boolean; start: number; stop: number; size: number; readable: boolean; writable: boolean; executable: boolean; access: number; private: boolean; guarded: boolean }>;
  memory_setAccess(pid: number, regionStart: number, readable: boolean, writable: boolean, executable: boolean): boolean;
  memory_setAccessFlags(pid: number, regionStart: number, flags: number): boolean;
  memory_getPtrSize(pid: number): number;
  memory_getMinAddress(pid: number): number;
  memory_getMaxAddress(pid: number): number;
  memory_getPageSize(pid: number): number;
  memory_find(pid: number, pattern: string, start?: number, stop?: number, limit?: number, flags?: string): number[];
  memory_readData(pid: number, address: number, length: number, flags?: number): Buffer | null;
  memory_writeData(pid: number, address: number, data: Buffer, flags?: number): number;
  memory_createCache(pid: number, address: number, size: number, blockSize: number, maxBlocks?: number, flags?: number): boolean;
  memory_clearCache(pid: number): void;
  memory_deleteCache(pid: number): void;
  memory_isCaching(pid: number): boolean;
  memory_getCacheSize(pid: number): number;
}

let _backend: NativeBackend | null = null;

export function getNativeBackend(): NativeBackend {
  if (_backend) return _backend;
  // Load the flat NAPI addon directly - it already exports all functions matching NativeBackend
  const addon = require("node-gyp-build")(require("path").resolve(__dirname, ".."));
  _backend = addon as NativeBackend;
  return _backend;
}

export function setNativeBackend(backend: NativeBackend): void {
  _backend = backend;
}
