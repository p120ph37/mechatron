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

// Bridge adapter: wraps the existing class-based C++ addon into the flat NativeBackend interface.
// This will be removed once the C++ addon is thinned to export flat functions directly.
function createBridgeBackend(addon: any): NativeBackend {
  // Cache keyboard/mouse instances for instance methods
  const kb = new addon.Keyboard();
  const ms = new addon.Mouse();

  return {
    // Keyboard
    keyboard_click(keycode: number) { kb.click(keycode); },
    keyboard_press(keycode: number) { kb.press(keycode); },
    keyboard_release(keycode: number) { kb.release(keycode); },
    keyboard_compile(keys: string) { return addon.Keyboard.compile(keys); },
    keyboard_getState() { return addon.Keyboard.getState(); },
    keyboard_getKeyState(keycode: number) { return addon.Keyboard.getState(keycode); },

    // Mouse
    mouse_click(button: number) { ms.click(button); },
    mouse_press(button: number) { ms.press(button); },
    mouse_release(button: number) { ms.release(button); },
    mouse_scrollH(amount: number) { ms.scrollH(amount); },
    mouse_scrollV(amount: number) { ms.scrollV(amount); },
    mouse_getPos() { const p = addon.Mouse.getPos(); return { x: p.x, y: p.y }; },
    mouse_setPos(x: number, y: number) { addon.Mouse.setPos(x, y); },
    mouse_getState() { return addon.Mouse.getState(); },
    mouse_getButtonState(button: number) { return addon.Mouse.getState(button); },

    // Clipboard
    clipboard_clear() { return addon.Clipboard.clear(); },
    clipboard_hasText() { return addon.Clipboard.hasText(); },
    clipboard_getText() { return addon.Clipboard.getText(); },
    clipboard_setText(text: string) { return addon.Clipboard.setText(text); },
    clipboard_hasImage() { return addon.Clipboard.hasImage(); },
    clipboard_getImage() {
      const img = new addon.Image();
      if (!addon.Clipboard.getImage(img)) return null;
      return { width: img.getWidth(), height: img.getHeight(), data: img.getData() };
    },
    clipboard_setImage(width: number, height: number, data: Uint32Array) {
      const img = new addon.Image();
      img.create(width, height);
      const imgData = img.getData();
      if (imgData) imgData.set(data);
      return addon.Clipboard.setImage(img);
    },
    clipboard_getSequence() { return addon.Clipboard.getSequence(); },

    // Screen
    screen_synchronize() {
      if (!addon.Screen.synchronize()) return null;
      const list = addon.Screen.getList();
      return list.map((s: any) => {
        const b = s.getBounds();
        const u = s.getUsable();
        return {
          bounds: { x: b.x, y: b.y, w: b.w, h: b.h },
          usable: { x: u.x, y: u.y, w: u.w, h: u.h },
        };
      });
    },
    screen_grabScreen(x: number, y: number, w: number, h: number, windowHandle?: number) {
      const img = new addon.Image();
      const bounds = new addon.Bounds(x, y, w, h);
      const win = windowHandle !== undefined ? new addon.Window(windowHandle) : undefined;
      const ok = win ? addon.Screen.grabScreen(img, bounds, win) : addon.Screen.grabScreen(img, bounds);
      if (!ok) return null;
      return img.getData();
    },
    screen_isCompositing() { return addon.Screen.isCompositing(); },
    screen_setCompositing(enabled: boolean) { addon.Screen.setCompositing(enabled); },
    screen_getTotalBounds() {
      const b = addon.Screen.getTotalBounds();
      return { x: b.x, y: b.y, w: b.w, h: b.h };
    },
    screen_getTotalUsable() {
      const u = addon.Screen.getTotalUsable();
      return { x: u.x, y: u.y, w: u.w, h: u.h };
    },

    // Window
    window_isValid(handle: number) { return new addon.Window(handle).isValid(); },
    window_close(handle: number) { new addon.Window(handle).close(); },
    window_isTopMost(handle: number) { return new addon.Window(handle).isTopMost(); },
    window_isBorderless(handle: number) { return new addon.Window(handle).isBorderless(); },
    window_isMinimized(handle: number) { return new addon.Window(handle).isMinimized(); },
    window_isMaximized(handle: number) { return new addon.Window(handle).isMaximized(); },
    window_setTopMost(handle: number, topMost: boolean) { new addon.Window(handle).setTopMost(topMost); },
    window_setBorderless(handle: number, borderless: boolean) { new addon.Window(handle).setBorderless(borderless); },
    window_setMinimized(handle: number, minimized: boolean) { new addon.Window(handle).setMinimized(minimized); },
    window_setMaximized(handle: number, maximized: boolean) { new addon.Window(handle).setMaximized(maximized); },
    window_getProcess(handle: number) { return new addon.Window(handle).getProcess().getPID(); },
    window_getPID(handle: number) { return new addon.Window(handle).getPID(); },
    window_getHandle(handle: number) { return handle; },
    window_setHandle(handle: number, newHandle: number) { return new addon.Window(handle).setHandle(newHandle); },
    window_getTitle(handle: number) { return new addon.Window(handle).getTitle(); },
    window_setTitle(handle: number, title: string) { new addon.Window(handle).setTitle(title); },
    window_getBounds(handle: number) {
      const b = new addon.Window(handle).getBounds();
      return { x: b.x, y: b.y, w: b.w, h: b.h };
    },
    window_setBounds(handle: number, x: number, y: number, w: number, h: number) {
      new addon.Window(handle).setBounds(x, y, w, h);
    },
    window_getClient(handle: number) {
      const b = new addon.Window(handle).getClient();
      return { x: b.x, y: b.y, w: b.w, h: b.h };
    },
    window_setClient(handle: number, x: number, y: number, w: number, h: number) {
      new addon.Window(handle).setClient(x, y, w, h);
    },
    window_mapToClient(handle: number, x: number, y: number) {
      const p = new addon.Window(handle).mapToClient(x, y);
      return { x: p.x, y: p.y };
    },
    window_mapToScreen(handle: number, x: number, y: number) {
      const p = new addon.Window(handle).mapToScreen(x, y);
      return { x: p.x, y: p.y };
    },
    window_getList(regex?: string) {
      const list = regex !== undefined ? addon.Window.getList(regex) : addon.Window.getList();
      return list.map((w: any) => w.getHandle());
    },
    window_getActive() { return addon.Window.getActive().getHandle(); },
    window_setActive(handle: number) { addon.Window.setActive(new addon.Window(handle)); },
    window_isAxEnabled(prompt?: boolean) { return addon.Window.isAxEnabled(prompt); },

    // Process
    process_open(pid: number) { const p = new addon.Process(pid); return p.open(pid); },
    process_close(pid: number) { new addon.Process(pid).close(); },
    process_isValid(pid: number) { return new addon.Process(pid).isValid(); },
    process_is64Bit(pid: number) { return new addon.Process(pid).is64Bit(); },
    process_isDebugged(pid: number) { return new addon.Process(pid).isDebugged(); },
    process_getPID(pid: number) { return pid; },
    process_getName(pid: number) { return new addon.Process(pid).getName(); },
    process_getPath(pid: number) { return new addon.Process(pid).getPath(); },
    process_exit(pid: number) { new addon.Process(pid).exit(); },
    process_kill(pid: number) { new addon.Process(pid).kill(); },
    process_hasExited(pid: number) { return new addon.Process(pid).hasExited(); },
    process_getModules(pid: number, regex?: string) {
      const p = new addon.Process(pid);
      const mods = regex !== undefined ? p.getModules(regex) : p.getModules();
      return mods.map((m: any) => ({
        valid: m.valid,
        name: m.name,
        path: m.path,
        base: m.base,
        size: m.size,
        pid: m.process.getPID(),
      }));
    },
    process_getWindows(pid: number, regex?: string) {
      const p = new addon.Process(pid);
      const wins = regex !== undefined ? p.getWindows(regex) : p.getWindows();
      return wins.map((w: any) => w.getHandle());
    },
    process_getList(regex?: string) {
      const list = regex !== undefined ? addon.Process.getList(regex) : addon.Process.getList();
      return list.map((p: any) => p.getPID());
    },
    process_getCurrent() { return addon.Process.getCurrent().getPID(); },
    process_isSys64Bit() { return addon.Process.isSys64Bit(); },
    process_getSegments(pid: number, base: number) {
      const p = new addon.Process(pid);
      return addon.Process._getSegments(p, base);
    },

    // Memory
    memory_isValid(pid: number) { return new addon.Memory(new addon.Process(pid)).isValid(); },
    memory_getRegion(pid: number, address: number) {
      const m = new addon.Memory(new addon.Process(pid));
      const r = m.getRegion(address);
      return {
        valid: r.valid, bound: r.bound,
        start: r.start, stop: r.stop, size: r.size,
        readable: r.readable, writable: r.writable, executable: r.executable,
        access: r.access, private: r["private"], guarded: r.guarded,
      };
    },
    memory_getRegions(pid: number, start?: number, stop?: number) {
      const m = new addon.Memory(new addon.Process(pid));
      const regions = m.getRegions(start, stop);
      return regions.map((r: any) => ({
        valid: r.valid, bound: r.bound,
        start: r.start, stop: r.stop, size: r.size,
        readable: r.readable, writable: r.writable, executable: r.executable,
        access: r.access, private: r["private"], guarded: r.guarded,
      }));
    },
    memory_setAccess(pid: number, regionStart: number, readable: boolean, writable: boolean, executable: boolean) {
      const m = new addon.Memory(new addon.Process(pid));
      const r = m.getRegion(regionStart);
      return m.setAccess(r, readable, writable, executable);
    },
    memory_setAccessFlags(pid: number, regionStart: number, flags: number) {
      const m = new addon.Memory(new addon.Process(pid));
      const r = m.getRegion(regionStart);
      return m.setAccess(r, flags);
    },
    memory_getPtrSize(pid: number) { return new addon.Memory(new addon.Process(pid)).getPtrSize(); },
    memory_getMinAddress(pid: number) { return new addon.Memory(new addon.Process(pid)).getMinAddress(); },
    memory_getMaxAddress(pid: number) { return new addon.Memory(new addon.Process(pid)).getMaxAddress(); },
    memory_getPageSize(pid: number) { return new addon.Memory(new addon.Process(pid)).getPageSize(); },
    memory_find(pid: number, pattern: string, start?: number, stop?: number, limit?: number, flags?: string) {
      const m = new addon.Memory(new addon.Process(pid));
      return m.find(pattern, start, stop, limit, flags);
    },
    memory_readData(pid: number, address: number, length: number, flags?: number) {
      const m = new addon.Memory(new addon.Process(pid));
      const buf = Buffer.alloc(length);
      const read = m.readData(address, buf, length, flags);
      return read > 0 ? buf : null;
    },
    memory_writeData(pid: number, address: number, data: Buffer, flags?: number) {
      const m = new addon.Memory(new addon.Process(pid));
      return m.writeData(address, data, data.length, flags);
    },
    memory_createCache(pid: number, address: number, size: number, blockSize: number, maxBlocks?: number, flags?: number) {
      return new addon.Memory(new addon.Process(pid)).createCache(address, size, blockSize, maxBlocks, flags);
    },
    memory_clearCache(pid: number) { new addon.Memory(new addon.Process(pid)).clearCache(); },
    memory_deleteCache(pid: number) { new addon.Memory(new addon.Process(pid)).deleteCache(); },
    memory_isCaching(pid: number) { return new addon.Memory(new addon.Process(pid)).isCaching(); },
    memory_getCacheSize(pid: number) { return new addon.Memory(new addon.Process(pid)).getCacheSize(); },
  };
}

export function getNativeBackend(): NativeBackend {
  if (_backend) return _backend;
  // Load the existing class-based NAPI addon and wrap it
  const addon = require("node-gyp-build")(require("path").resolve(__dirname, ".."));
  _backend = createBridgeBackend(addon);
  return _backend;
}

export function setNativeBackend(backend: NativeBackend): void {
  _backend = backend;
}
