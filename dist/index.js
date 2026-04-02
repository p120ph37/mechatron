var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// lib/Size.ts
class Size {
  w;
  h;
  constructor(a, b) {
    if (a === undefined) {
      this.w = 0;
      this.h = 0;
    } else if (a instanceof Size) {
      this.w = a.w;
      this.h = a.h;
    } else if (typeof a === "object") {
      this.w = a.w;
      this.h = a.h;
    } else if (b !== undefined) {
      this.w = a;
      this.h = b;
    } else {
      this.w = a;
      this.h = a;
    }
  }
  isZero() {
    return this.w === 0 && this.h === 0;
  }
  isEmpty() {
    return this.w === 0 || this.h === 0;
  }
  toPoint() {
    return new Point(this.w, this.h);
  }
  add(other, b) {
    const s = Size._resolve(other, b);
    return new Size(this.w + s.w, this.h + s.h);
  }
  sub(other, b) {
    const s = Size._resolve(other, b);
    return new Size(this.w - s.w, this.h - s.h);
  }
  eq(...args) {
    if (args.length === 0)
      return false;
    const a0 = args[0];
    if (a0 instanceof Size)
      return this.w === a0.w && this.h === a0.h;
    if (typeof a0 === "object" && a0 !== null && "w" in a0 && "h" in a0) {
      return this.w === a0.w && this.h === a0.h;
    }
    if (typeof a0 === "number" && args.length >= 2)
      return this.w === a0 && this.h === args[1];
    if (typeof a0 === "number")
      return this.w === a0 && this.h === a0;
    throw new TypeError("Invalid arguments");
  }
  ne(...args) {
    if (args.length === 0)
      return true;
    return !this.eq(...args);
  }
  clone() {
    return new Size(this);
  }
  toString() {
    return `[${this.w}, ${this.h}]`;
  }
  static normalize(a, b) {
    if (a instanceof Size)
      return { w: a.w, h: a.h };
    if (typeof a === "object" && a !== null && a !== undefined)
      return { w: a.w, h: a.h };
    if (b !== undefined)
      return { w: a, h: b };
    if (typeof a === "number")
      return { w: a, h: a };
    return { w: 0, h: 0 };
  }
  static _resolve(a, b) {
    if (a instanceof Size)
      return a;
    if (typeof a === "object" && a !== null && a !== undefined)
      return a;
    if (b !== undefined)
      return { w: a, h: b };
    if (typeof a === "number")
      return { w: a, h: a };
    return { w: 0, h: 0 };
  }
}
var init_Size = __esm(() => {
  init_Point();
});

// lib/Point.ts
class Point {
  x;
  y;
  constructor(a, b) {
    if (a === undefined) {
      this.x = 0;
      this.y = 0;
    } else if (a instanceof Point) {
      this.x = a.x;
      this.y = a.y;
    } else if (typeof a === "object") {
      this.x = a.x;
      this.y = a.y;
    } else if (b !== undefined) {
      this.x = a;
      this.y = b;
    } else {
      this.x = a;
      this.y = a;
    }
  }
  isZero() {
    return this.x === 0 && this.y === 0;
  }
  toSize() {
    return new Size(this.x, this.y);
  }
  add(other, b) {
    const p = Point._resolve(other, b);
    return new Point(this.x + p.x, this.y + p.y);
  }
  sub(other, b) {
    const p = Point._resolve(other, b);
    return new Point(this.x - p.x, this.y - p.y);
  }
  neg() {
    return new Point(-this.x, -this.y);
  }
  eq(...args) {
    if (args.length === 0)
      return false;
    const a0 = args[0];
    if (a0 instanceof Point)
      return this.x === a0.x && this.y === a0.y;
    if (typeof a0 === "object" && a0 !== null && "x" in a0 && "y" in a0) {
      return this.x === a0.x && this.y === a0.y;
    }
    if (typeof a0 === "number" && args.length >= 2)
      return this.x === a0 && this.y === args[1];
    if (typeof a0 === "number")
      return this.x === a0 && this.y === a0;
    throw new TypeError("Invalid arguments");
  }
  ne(...args) {
    if (args.length === 0)
      return true;
    return !this.eq(...args);
  }
  clone() {
    return new Point(this);
  }
  toString() {
    return `[${this.x}, ${this.y}]`;
  }
  static normalize(a, b) {
    if (a instanceof Point)
      return { x: a.x, y: a.y };
    if (typeof a === "object" && a !== null && a !== undefined)
      return { x: a.x, y: a.y };
    if (b !== undefined)
      return { x: a, y: b };
    if (typeof a === "number")
      return { x: a, y: a };
    return { x: 0, y: 0 };
  }
  static _resolve(a, b) {
    if (a instanceof Point)
      return a;
    if (typeof a === "object" && a !== null && a !== undefined)
      return a;
    if (b !== undefined)
      return { x: a, y: b };
    if (typeof a === "number")
      return { x: a, y: a };
    return { x: 0, y: 0 };
  }
}
var init_Point = __esm(() => {
  init_Size();
});

// lib/Bounds.ts
class Bounds {
  x;
  y;
  w;
  h;
  constructor(a, b, c, d) {
    if (a === undefined) {
      this.x = 0;
      this.y = 0;
      this.w = 0;
      this.h = 0;
    } else if (a instanceof Bounds) {
      this.x = a.x;
      this.y = a.y;
      this.w = a.w;
      this.h = a.h;
    } else if (a instanceof Point && (b instanceof Size || typeof b === "object" && b !== null && ("w" in b))) {
      this.x = a.x;
      this.y = a.y;
      const s = b;
      this.w = s.w;
      this.h = s.h;
    } else if (typeof a === "object" && "x" in a && "w" in a) {
      this.x = a.x;
      this.y = a.y;
      this.w = a.w;
      this.h = a.h;
    } else if (typeof a === "object" && "l" in a) {
      const o = a;
      this.x = o.l;
      this.y = o.t;
      this.w = o.r - o.l;
      this.h = o.b - o.t;
    } else if (typeof a === "object" && "x" in a && typeof b === "object" && b !== null) {
      const p = a;
      const s = b;
      this.x = p.x;
      this.y = p.y;
      this.w = s.w;
      this.h = s.h;
    } else if (typeof a === "number" && c !== undefined) {
      this.x = a;
      this.y = b;
      this.w = c;
      this.h = d;
    } else if (typeof a === "number" && b !== undefined) {
      this.x = a;
      this.y = a;
      this.w = b;
      this.h = b;
    } else {
      const v = a;
      this.x = v;
      this.y = v;
      this.w = v;
      this.h = v;
    }
  }
  isZero() {
    return this.x === 0 && this.y === 0 && this.w === 0 && this.h === 0;
  }
  isEmpty() {
    return this.w === 0 || this.h === 0;
  }
  isValid() {
    return this.w > 0 && this.h > 0;
  }
  getLeft() {
    return this.x;
  }
  getTop() {
    return this.y;
  }
  getRight() {
    return this.x + this.w;
  }
  getBottom() {
    return this.y + this.h;
  }
  setLeft(l) {
    if (typeof l !== "number")
      throw new TypeError("Invalid arguments");
    this.x = l;
  }
  setTop(t) {
    if (typeof t !== "number")
      throw new TypeError("Invalid arguments");
    this.y = t;
  }
  setRight(r) {
    if (typeof r !== "number")
      throw new TypeError("Invalid arguments");
    this.w = r - this.x;
  }
  setBottom(b) {
    if (typeof b !== "number")
      throw new TypeError("Invalid arguments");
    this.h = b - this.y;
  }
  getLTRB() {
    return { l: this.x, t: this.y, r: this.x + this.w, b: this.y + this.h };
  }
  setLTRB(l, t, r, b) {
    if (typeof l !== "number" || typeof t !== "number" || typeof r !== "number" || typeof b !== "number") {
      throw new TypeError("Invalid arguments");
    }
    this.x = l;
    this.y = t;
    this.w = r - l;
    this.h = b - t;
  }
  normalize() {
    if (this.w < 0) {
      this.x += this.w;
      this.w = -this.w;
    }
    if (this.h < 0) {
      this.y += this.h;
      this.h = -this.h;
    }
  }
  static _norm(x, y, w, h) {
    let l = x, r = x, t = y, b = y;
    if (w < 0)
      l += w;
    else
      r += w;
    if (h < 0)
      t += h;
    else
      b += h;
    return { l, r, t, b };
  }
  containsP(...args) {
    const inc = typeof args[args.length - 1] === "boolean" ? args.pop() : true;
    if (args.length > 0 && typeof args[0] !== "number" && !(typeof args[0] === "object" && args[0] !== null && ("x" in args[0]) && ("y" in args[0])) && !(args[0] instanceof Point)) {
      throw new TypeError("Invalid arguments");
    }
    const p = Point._resolve(args[0], args[1]);
    const { l, r, t, b } = Bounds._norm(this.x, this.y, this.w, this.h);
    return inc ? l <= p.x && p.x <= r && t <= p.y && p.y <= b : l < p.x && p.x < r && t < p.y && p.y < b;
  }
  containsB(...args) {
    const inc = typeof args[args.length - 1] === "boolean" ? args.pop() : true;
    Bounds._validateArgs(args);
    const o = Bounds._resolveArgs(args);
    if (this.w === 0 && this.h === 0 || o.w === 0 && o.h === 0)
      return false;
    const n1 = Bounds._norm(this.x, this.y, this.w, this.h);
    const n2 = Bounds._norm(o.x, o.y, o.w, o.h);
    return inc ? n1.l <= n2.l && n1.r >= n2.r && n1.t <= n2.t && n1.b >= n2.b : n1.l < n2.l && n1.r > n2.r && n1.t < n2.t && n1.b > n2.b;
  }
  intersects(...args) {
    const inc = typeof args[args.length - 1] === "boolean" ? args.pop() : true;
    Bounds._validateArgs(args);
    const o = Bounds._resolveArgs(args);
    if (this.w === 0 && this.h === 0 || o.w === 0 && o.h === 0)
      return false;
    const n1 = Bounds._norm(this.x, this.y, this.w, this.h);
    const n2 = Bounds._norm(o.x, o.y, o.w, o.h);
    return inc ? n1.l <= n2.r && n1.r >= n2.l && n1.t <= n2.b && n1.b >= n2.t : n1.l < n2.r && n1.r > n2.l && n1.t < n2.b && n1.b > n2.t;
  }
  getPoint() {
    return new Point(this.x, this.y);
  }
  setPoint(p, y) {
    if (p !== undefined && typeof p !== "number" && !(typeof p === "object" && p !== null && ("x" in p) && ("y" in p)) && !(p instanceof Point)) {
      throw new TypeError("Invalid arguments");
    }
    const pt = Point._resolve(p, y);
    this.x = pt.x;
    this.y = pt.y;
  }
  getSize() {
    return new Size(this.w, this.h);
  }
  setSize(s, h) {
    if (s !== undefined && typeof s !== "number" && !(typeof s === "object" && s !== null && ("w" in s) && ("h" in s)) && !(s instanceof Size)) {
      throw new TypeError("Invalid arguments");
    }
    const sz = Size._resolve(s, h);
    this.w = sz.w;
    this.h = sz.h;
  }
  getCenter() {
    return new Point(this.x + Math.trunc(this.w * 0.5), this.y + Math.trunc(this.h * 0.5));
  }
  unite(...args) {
    Bounds._validateArgs(args);
    const o = Bounds._resolveArgs(args);
    const n1 = Bounds._norm(this.x, this.y, this.w, this.h);
    const n2 = Bounds._norm(o.x, o.y, o.w, o.h);
    const result = new Bounds;
    if (this.w === 0 && this.h === 0) {
      result.setLTRB(n2.l, n2.t, n2.r, n2.b);
      return result;
    }
    if (o.w === 0 && o.h === 0) {
      result.setLTRB(n1.l, n1.t, n1.r, n1.b);
      return result;
    }
    result.setLTRB(Math.min(n1.l, n2.l), Math.min(n1.t, n2.t), Math.max(n1.r, n2.r), Math.max(n1.b, n2.b));
    return result;
  }
  intersect(...args) {
    Bounds._validateArgs(args);
    const o = Bounds._resolveArgs(args);
    if (this.w === 0 && this.h === 0 || o.w === 0 && o.h === 0)
      return new Bounds;
    const n1 = Bounds._norm(this.x, this.y, this.w, this.h);
    const n2 = Bounds._norm(o.x, o.y, o.w, o.h);
    if (n1.l > n2.r || n1.r < n2.l || n1.t > n2.b || n1.b < n2.t)
      return new Bounds;
    const result = new Bounds;
    result.setLTRB(Math.max(n1.l, n2.l), Math.max(n1.t, n2.t), Math.min(n1.r, n2.r), Math.min(n1.b, n2.b));
    return result;
  }
  eq(...args) {
    if (args.length === 0)
      return false;
    Bounds._validateArgs(args);
    const o = Bounds._resolveArgs(args);
    return this.x === o.x && this.y === o.y && this.w === o.w && this.h === o.h;
  }
  ne(...args) {
    if (args.length === 0)
      return true;
    Bounds._validateArgs(args);
    return !this.eq(...args);
  }
  clone() {
    return new Bounds(this);
  }
  toString() {
    return `[${this.x}, ${this.y}, ${this.w}, ${this.h}]`;
  }
  static normalize(...args) {
    const b = Bounds._resolveArgs(args);
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }
  static _validateArgs(args) {
    if (args.length === 0)
      return;
    const a0 = args[0];
    if (a0 === undefined)
      return;
    if (typeof a0 === "string")
      throw new TypeError("Invalid arguments");
    if (a0 instanceof Bounds)
      return;
    if (typeof a0 === "number") {
      if (args.length >= 4)
        return;
      if (args.length >= 2)
        return;
      return;
    }
    if (typeof a0 === "object" && a0 !== null) {
      if ("w" in a0 && "h" in a0 && "x" in a0 && "y" in a0)
        return;
      if ("l" in a0 && "t" in a0 && "r" in a0 && "b" in a0)
        return;
      if ("x" in a0 && "y" in a0 && args.length >= 2) {
        const a1 = args[1];
        if (typeof a1 === "object" && a1 !== null && "w" in a1 && "h" in a1)
          return;
      }
      throw new TypeError("Invalid arguments");
    }
    throw new TypeError("Invalid arguments");
  }
  static _resolveArgs(args) {
    const a0 = args[0];
    if (a0 instanceof Bounds)
      return { x: a0.x, y: a0.y, w: a0.w, h: a0.h };
    if (typeof a0 === "object" && a0 !== null && "x" in a0 && "w" in a0) {
      return { x: a0.x, y: a0.y, w: a0.w, h: a0.h };
    }
    if (typeof a0 === "object" && a0 !== null && "l" in a0) {
      return { x: a0.l, y: a0.t, w: a0.r - a0.l, h: a0.b - a0.t };
    }
    if (typeof a0 === "object" && a0 !== null && "x" in a0 && "y" in a0 && args.length >= 2) {
      const a1 = args[1];
      if (typeof a1 === "object" && a1 !== null && "w" in a1 && "h" in a1) {
        return { x: a0.x, y: a0.y, w: a1.w, h: a1.h };
      }
    }
    if (typeof a0 === "number" && args.length >= 4) {
      return { x: a0, y: args[1], w: args[2], h: args[3] };
    }
    if (typeof a0 === "number")
      return { x: a0, y: a0, w: a0, h: a0 };
    return { x: 0, y: 0, w: 0, h: 0 };
  }
}
var init_Bounds = __esm(() => {
  init_Point();
  init_Size();
});

// lib/native.ts
var exports_native = {};
__export(exports_native, {
  setNativeBackend: () => setNativeBackend,
  getNativeBackend: () => getNativeBackend
});
function getRustNodeFile() {
  const p = process.platform;
  const a = process.arch;
  const map = {
    "linux-x64": "mechatron-native.linux-x64-gnu.node",
    "linux-arm64": "mechatron-native.linux-arm64-gnu.node",
    "darwin-x64": "mechatron-native.darwin-x64.node",
    "darwin-arm64": "mechatron-native.darwin-arm64.node",
    "win32-x64": "mechatron-native.win32-x64-msvc.node",
    "win32-ia32": "mechatron-native.win32-ia32-msvc.node"
  };
  return map[`${p}-${a}`] || `mechatron-native.${p}-${a}.node`;
}
function getNativeBackend() {
  if (_backend)
    return _backend;
  try {
    const path = require("path");
    const rustAddon = require(path.resolve(__dirname, "..", "native-rs", getRustNodeFile()));
    _backend = rustAddon;
  } catch (_e) {
    const addon = require("node-gyp-build")(require("path").resolve(__dirname, ".."));
    _backend = addon;
  }
  return _backend;
}
function setNativeBackend(backend) {
  _backend = backend;
}
var __dirname = "/home/user/mechatron/lib", _backend = null;

// lib/Process.ts
var exports_Process = {};
__export(exports_Process, {
  Process: () => Process
});
function getNative3() {
  const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
  return getNativeBackend2();
}

class Process {
  _pid;
  constructor(pid) {
    if (pid instanceof Process) {
      this._pid = pid._pid;
    } else {
      this._pid = typeof pid === "number" ? pid : 0;
    }
  }
  open(pid) {
    const valid = getNative3().process_open(pid);
    this._pid = valid ? pid : 0;
    return valid;
  }
  close() {
    getNative3().process_close(this._pid);
    this._pid = 0;
  }
  isValid() {
    return getNative3().process_isValid(this._pid);
  }
  is64Bit() {
    return getNative3().process_is64Bit(this._pid);
  }
  isDebugged() {
    return getNative3().process_isDebugged(this._pid);
  }
  getPID() {
    return this._pid;
  }
  getName() {
    return getNative3().process_getName(this._pid);
  }
  getPath() {
    return getNative3().process_getPath(this._pid);
  }
  exit() {
    getNative3().process_exit(this._pid);
  }
  kill() {
    getNative3().process_kill(this._pid);
  }
  hasExited() {
    return getNative3().process_hasExited(this._pid);
  }
  getModules(regex) {
    return getNative3().process_getModules(this._pid, regex);
  }
  getWindows(regex) {
    const handles = getNative3().process_getWindows(this._pid, regex);
    return handles.map((h) => new Window(h));
  }
  eq(other) {
    if (other instanceof Process) {
      return this._pid === other._pid;
    }
    return this._pid === other;
  }
  ne(other) {
    return !this.eq(other);
  }
  clone() {
    return new Process(this._pid);
  }
  static getList(regex) {
    const pids = getNative3().process_getList(regex);
    return pids.map((pid) => new Process(pid));
  }
  static getCurrent() {
    return new Process(getNative3().process_getCurrent());
  }
  static isSys64Bit() {
    return getNative3().process_isSys64Bit();
  }
  static _getSegments(process2, base) {
    return getNative3().process_getSegments(process2._pid, base);
  }
}
var init_Process = __esm(() => {
  init_Window();
});

// lib/Window.ts
function getNative4() {
  const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
  return getNativeBackend2();
}

class Window {
  _handle;
  constructor(handle) {
    if (handle instanceof Window) {
      this._handle = handle._handle;
    } else {
      this._handle = handle || 0;
    }
  }
  isValid() {
    return getNative4().window_isValid(this._handle);
  }
  close() {
    getNative4().window_close(this._handle);
  }
  isTopMost() {
    return getNative4().window_isTopMost(this._handle);
  }
  isBorderless() {
    return getNative4().window_isBorderless(this._handle);
  }
  isMinimized() {
    return getNative4().window_isMinimized(this._handle);
  }
  isMaximized() {
    return getNative4().window_isMaximized(this._handle);
  }
  setTopMost(topMost) {
    getNative4().window_setTopMost(this._handle, topMost);
  }
  setBorderless(borderless) {
    getNative4().window_setBorderless(this._handle, borderless);
  }
  setMinimized(minimized) {
    getNative4().window_setMinimized(this._handle, minimized);
  }
  setMaximized(maximized) {
    getNative4().window_setMaximized(this._handle, maximized);
  }
  getProcess() {
    const { Process: Process2 } = (init_Process(), __toCommonJS(exports_Process));
    return new Process2(getNative4().window_getProcess(this._handle));
  }
  getPID() {
    return getNative4().window_getPID(this._handle);
  }
  getHandle() {
    return this._handle;
  }
  setHandle(handle) {
    const result = getNative4().window_setHandle(this._handle, handle);
    if (result)
      this._handle = handle;
    return result;
  }
  getTitle() {
    return getNative4().window_getTitle(this._handle);
  }
  setTitle(title) {
    getNative4().window_setTitle(this._handle, title);
  }
  getBounds() {
    const b = getNative4().window_getBounds(this._handle);
    return new Bounds(b.x, b.y, b.w, b.h);
  }
  setBounds(a, b, c, d) {
    if (a === undefined) {
      getNative4().window_setBounds(this._handle, 0, 0, 0, 0);
    } else if (typeof a === "number") {
      getNative4().window_setBounds(this._handle, a, b, c, d);
    } else {
      getNative4().window_setBounds(this._handle, a.x, a.y, a.w, a.h);
    }
  }
  getClient() {
    const b = getNative4().window_getClient(this._handle);
    return new Bounds(b.x, b.y, b.w, b.h);
  }
  setClient(a, b, c, d) {
    if (a === undefined) {
      getNative4().window_setClient(this._handle, 0, 0, 0, 0);
    } else if (typeof a === "number") {
      getNative4().window_setClient(this._handle, a, b, c, d);
    } else {
      getNative4().window_setClient(this._handle, a.x, a.y, a.w, a.h);
    }
  }
  mapToClient(a, b) {
    let x, y;
    if (a === undefined) {
      x = 0;
      y = 0;
    } else if (typeof a === "number") {
      x = a;
      y = b !== undefined ? b : a;
    } else {
      x = a.x;
      y = a.y;
    }
    const p = getNative4().window_mapToClient(this._handle, x, y);
    return new Point(p.x, p.y);
  }
  mapToScreen(a, b) {
    let x, y;
    if (a === undefined) {
      x = 0;
      y = 0;
    } else if (typeof a === "number") {
      x = a;
      y = b !== undefined ? b : a;
    } else {
      x = a.x;
      y = a.y;
    }
    const p = getNative4().window_mapToScreen(this._handle, x, y);
    return new Point(p.x, p.y);
  }
  eq(other) {
    if (other instanceof Window) {
      return this._handle === other._handle;
    }
    return this._handle === other;
  }
  ne(other) {
    return !this.eq(other);
  }
  clone() {
    return new Window(this._handle);
  }
  static getList(title) {
    const handles = getNative4().window_getList(title);
    return handles.map((h) => new Window(h));
  }
  static getActive() {
    return new Window(getNative4().window_getActive());
  }
  static setActive(window) {
    getNative4().window_setActive(window._handle);
  }
  static isAxEnabled(prompt) {
    return getNative4().window_isAxEnabled(prompt);
  }
}
var init_Window = __esm(() => {
  init_Bounds();
  init_Point();
});
// lib/Range.ts
class Range {
  min;
  max;
  _state;
  constructor(a, b) {
    this._state = (Math.floor(Date.now() / 1000) & 2147483647) >>> 0;
    if (a === undefined) {
      this.min = 0;
      this.max = 0;
    } else if (a instanceof Range) {
      this.min = a.min;
      this.max = a.max;
    } else if (typeof a === "object") {
      this.min = a.min;
      this.max = a.max;
    } else if (b !== undefined) {
      this.min = a;
      this.max = b;
    } else {
      this.min = a;
      this.max = a;
    }
  }
  getRange() {
    return this.max - this.min;
  }
  setRange(a, b) {
    if (a === undefined)
      return;
    if (a instanceof Range) {
      this.min = a.min;
      this.max = a.max;
    } else if (typeof a === "object") {
      this.min = a.min;
      this.max = a.max;
    } else if (b !== undefined) {
      this.min = a;
      this.max = b;
    } else {
      this.min = a;
      this.max = a;
    }
  }
  contains(value, inclusive) {
    if (typeof value !== "number")
      throw new TypeError("Invalid arguments");
    if (inclusive !== undefined && typeof inclusive !== "boolean")
      throw new TypeError("Invalid arguments");
    const incl = inclusive !== undefined ? inclusive : true;
    return incl ? this.min <= value && value <= this.max : this.min < value && value < this.max;
  }
  getRandom() {
    if (this.min >= this.max)
      return this.min;
    this._state = (Math.imul(this._state, 1103515245) + 12345 & 2147483647) >>> 0;
    return this._state % (this.max - this.min) + this.min;
  }
  eq(...args) {
    if (args.length === 0)
      return false;
    const a0 = args[0];
    if (a0 instanceof Range)
      return this.min === a0.min && this.max === a0.max;
    if (typeof a0 === "object" && a0 !== null && "min" in a0 && "max" in a0) {
      return this.min === a0.min && this.max === a0.max;
    }
    if (typeof a0 === "number" && args.length >= 2)
      return this.min === a0 && this.max === args[1];
    if (typeof a0 === "number")
      return this.min === a0 && this.max === a0;
    throw new TypeError("Invalid arguments");
  }
  ne(...args) {
    if (args.length === 0)
      return true;
    return !this.eq(...args);
  }
  clone() {
    return new Range(this);
  }
  toString() {
    return `[${this.min}, ${this.max}]`;
  }
  static normalize(a, b) {
    if (a instanceof Range)
      return { min: a.min, max: a.max };
    if (typeof a === "object" && a !== null && a !== undefined)
      return { min: a.min, max: a.max };
    if (b !== undefined)
      return { min: a, max: b };
    if (typeof a === "number")
      return { min: a, max: a };
    return { min: 0, max: 0 };
  }
}

// lib/index.ts
init_Point();
init_Size();
init_Bounds();

// lib/Color.ts
class Color {
  a;
  r;
  g;
  b;
  constructor(a, g, b, alpha) {
    if (a === undefined) {
      this.a = 0;
      this.r = 0;
      this.g = 0;
      this.b = 0;
    } else if (a instanceof Color) {
      this.a = a.a;
      this.r = a.r;
      this.g = a.g;
      this.b = a.b;
    } else if (typeof a === "object") {
      this.r = a.r;
      this.g = a.g;
      this.b = a.b;
      this.a = a.a !== undefined ? a.a : 255;
    } else if (g !== undefined) {
      this.r = a;
      this.g = g;
      this.b = b;
      this.a = alpha !== undefined ? alpha : 255;
    } else {
      this.a = (a & 4278190080) >>> 24;
      this.r = (a & 16711680) >>> 16;
      this.g = (a & 65280) >>> 8;
      this.b = (a & 255) >>> 0;
    }
  }
  getARGB() {
    return (this.a << 24 | this.r << 16 | this.g << 8 | this.b) >>> 0;
  }
  setARGB(argb) {
    if (typeof argb !== "number")
      throw new TypeError("Invalid arguments");
    this.a = (argb & 4278190080) >>> 24;
    this.r = (argb & 16711680) >>> 16;
    this.g = (argb & 65280) >>> 8;
    this.b = (argb & 255) >>> 0;
  }
  eq(...args) {
    if (args.length === 0)
      return false;
    const c = Color._resolve(args);
    return this.a === c.a && this.r === c.r && this.g === c.g && this.b === c.b;
  }
  ne(...args) {
    if (args.length === 0)
      return true;
    return !this.eq(...args);
  }
  clone() {
    return new Color(this);
  }
  toString() {
    return `[${this.r}, ${this.g}, ${this.b}, ${this.a}]`;
  }
  static normalize(...args) {
    if (args.length === 0)
      return { r: 0, g: 0, b: 0, a: 0 };
    const c = Color._resolve(args);
    return { r: c.r, g: c.g, b: c.b, a: c.a };
  }
  static _resolve(args) {
    const a0 = args[0];
    if (a0 instanceof Color)
      return { a: a0.a, r: a0.r, g: a0.g, b: a0.b };
    if (typeof a0 === "object" && a0 !== null && "r" in a0 && "g" in a0 && "b" in a0) {
      return { r: a0.r, g: a0.g, b: a0.b, a: a0.a !== undefined ? a0.a : 255 };
    }
    if (typeof a0 === "number" && args.length >= 3) {
      return { r: a0, g: args[1], b: args[2], a: args[3] !== undefined ? args[3] : 255 };
    }
    if (typeof a0 === "number" && args.length === 1) {
      return {
        a: (a0 & 4278190080) >>> 24,
        r: (a0 & 16711680) >>> 16,
        g: (a0 & 65280) >>> 8,
        b: (a0 & 255) >>> 0
      };
    }
    throw new TypeError("Invalid arguments");
  }
}

// lib/Hash.ts
var CRC32_TABLE = new Uint32Array([
  0,
  1996959894,
  3993919788,
  2567524794,
  124634137,
  1886057615,
  3915621685,
  2657392035,
  249268274,
  2044508324,
  3772115230,
  2547177864,
  162941995,
  2125561021,
  3887607047,
  2428444049,
  498536548,
  1789927666,
  4089016648,
  2227061214,
  450548861,
  1843258603,
  4107580753,
  2211677639,
  325883990,
  1684777152,
  4251122042,
  2321926636,
  335633487,
  1661365465,
  4195302755,
  2366115317,
  997073096,
  1281953886,
  3579855332,
  2724688242,
  1006888145,
  1258607687,
  3524101629,
  2768942443,
  901097722,
  1119000684,
  3686517206,
  2898065728,
  853044451,
  1172266101,
  3705015759,
  2882616665,
  651767980,
  1373503546,
  3369554304,
  3218104598,
  565507253,
  1454621731,
  3485111705,
  3099436303,
  671266974,
  1594198024,
  3322730930,
  2970347812,
  795835527,
  1483230225,
  3244367275,
  3060149565,
  1994146192,
  31158534,
  2563907772,
  4023717930,
  1907459465,
  112637215,
  2680153253,
  3904427059,
  2013776290,
  251722036,
  2517215374,
  3775830040,
  2137656763,
  141376813,
  2439277719,
  3865271297,
  1802195444,
  476864866,
  2238001368,
  4066508878,
  1812370925,
  453092731,
  2181625025,
  4111451223,
  1706088902,
  314042704,
  2344532202,
  4240017532,
  1658658271,
  366619977,
  2362670323,
  4224994405,
  1303535960,
  984961486,
  2747007092,
  3569037538,
  1256170817,
  1037604311,
  2765210733,
  3554079995,
  1131014506,
  879679996,
  2909243462,
  3663771856,
  1141124467,
  855842277,
  2852801631,
  3708648649,
  1342533948,
  654459306,
  3188396048,
  3373015174,
  1466479909,
  544179635,
  3110523913,
  3462522015,
  1591671054,
  702138776,
  2966460450,
  3352799412,
  1504918807,
  783551873,
  3082640443,
  3233442989,
  3988292384,
  2596254646,
  62317068,
  1957810842,
  3939845945,
  2647816111,
  81470997,
  1943803523,
  3814918930,
  2489596804,
  225274430,
  2053790376,
  3826175755,
  2466906013,
  167816743,
  2097651377,
  4027552580,
  2265490386,
  503444072,
  1762050814,
  4150417245,
  2154129355,
  426522225,
  1852507879,
  4275313526,
  2312317920,
  282753626,
  1742555852,
  4189708143,
  2394877945,
  397917763,
  1622183637,
  3604390888,
  2714866558,
  953729732,
  1340076626,
  3518719985,
  2797360999,
  1068828381,
  1219638859,
  3624741850,
  2936675148,
  906185462,
  1090812512,
  3747672003,
  2825379669,
  829329135,
  1181335161,
  3412177804,
  3160834842,
  628085408,
  1382605366,
  3423369109,
  3138078467,
  570562233,
  1426400815,
  3317316542,
  2998733608,
  733239954,
  1555261956,
  3268935591,
  3050360625,
  752459403,
  1541320221,
  2607071920,
  3965973030,
  1969922972,
  40735498,
  2617837225,
  3943577151,
  1913087877,
  83908371,
  2512341634,
  3803740692,
  2075208622,
  213261112,
  2463272603,
  3855990285,
  2094854071,
  198958881,
  2262029012,
  4057260610,
  1759359992,
  534414190,
  2176718541,
  4139329115,
  1873836001,
  414664567,
  2282248934,
  4279200368,
  1711684554,
  285281116,
  2405801727,
  4167216745,
  1634467795,
  376229701,
  2685067896,
  3608007406,
  1308918612,
  956543938,
  2808555105,
  3495958263,
  1231636301,
  1047427035,
  2932959818,
  3654703836,
  1088359270,
  936918000,
  2847714899,
  3736837829,
  1202900863,
  817233897,
  3183342108,
  3401237130,
  1404277552,
  615818150,
  3134207493,
  3453421203,
  1423857449,
  601450431,
  3009837614,
  3294710456,
  1567103746,
  711928724,
  3020668471,
  3272380065,
  1510334235,
  755167117
]);
function toPrimitive(v) {
  if (typeof v !== "object" || v === null)
    return v;
  if (typeof v.valueOf === "function") {
    const p = v.valueOf();
    if (p !== v)
      return p;
  }
  if (typeof v[Symbol.toPrimitive] === "function") {
    return v[Symbol.toPrimitive]();
  }
  return v;
}

class Hash {
  result;
  constructor(a) {
    this.result = 0;
    if (a === undefined)
      return;
    if (a instanceof Hash) {
      this.result = a.result;
      return;
    }
    if (typeof a === "number") {
      this.result = a;
      return;
    }
    this.append(a);
  }
  append(data) {
    if (data === undefined)
      throw new TypeError("Invalid arguments");
    const p = toPrimitive(data);
    let bytes;
    if (p instanceof Uint8Array || Buffer.isBuffer(p)) {
      bytes = p;
    } else if (p instanceof ArrayBuffer) {
      bytes = new Uint8Array(p);
    } else if (Array.isArray(p)) {
      bytes = new Uint8Array(p);
    } else {
      const str = String(p);
      bytes = new TextEncoder().encode(str);
    }
    if (bytes.length === 0)
      return;
    let crc = ~this.result >>> 0;
    for (let i = 0;i < bytes.length; i++) {
      crc = crc >>> 8 ^ CRC32_TABLE[(crc ^ bytes[i]) & 255];
    }
    this.result = ~crc >>> 0;
  }
  eq(other) {
    if (other instanceof Hash)
      return this.result === other.result;
    if (typeof other === "number")
      return this.result === other >>> 0;
    throw new TypeError("Invalid arguments");
  }
  ne(other) {
    if (other instanceof Hash)
      return this.result !== other.result;
    if (typeof other === "number")
      return this.result !== other >>> 0;
    throw new TypeError("Invalid arguments");
  }
  clone() {
    const copy = new Hash;
    copy.result = this.result;
    return copy;
  }
  toString() {
    return "0x" + (this.result >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }
}

// lib/Image.ts
init_Point();

class Image {
  _width = 0;
  _height = 0;
  _length = 0;
  _data = null;
  _limit = 0;
  constructor(a, b) {
    if (a === undefined)
      return;
    if (a instanceof Image) {
      if (a._data && a._length > 0) {
        this.create(a._width, a._height);
        if (this._data)
          this._data.set(a._data.subarray(0, this._length));
      }
      return;
    }
    if (b !== undefined) {
      this.create(a, b);
    } else {
      this.create(a, a);
    }
  }
  isValid() {
    return this._data !== null && this._length > 0;
  }
  create(a, b) {
    if (typeof a !== "number" && !(typeof a === "object" && a !== null && ("w" in a) && ("h" in a))) {
      throw new TypeError("Invalid arguments");
    }
    let w, h;
    if (typeof a === "number" && b !== undefined) {
      w = a;
      h = b;
    } else if (typeof a === "number") {
      w = a;
      h = a;
    } else {
      w = a.w;
      h = a.h;
    }
    if (w === 0 || h === 0)
      return false;
    this._width = w;
    this._height = h;
    this._length = w * h;
    if (this._limit < this._length) {
      this._data = new Uint32Array(this._length);
      this._limit = this._length;
    }
    return true;
  }
  destroy() {
    this._width = 0;
    this._height = 0;
    this._length = 0;
    this._data = null;
    this._limit = 0;
  }
  getWidth() {
    return this._width;
  }
  getHeight() {
    return this._height;
  }
  getLength() {
    return this._length;
  }
  getLimit() {
    return this._limit;
  }
  getData() {
    if (!this._data || this._length === 0)
      return null;
    return this._data.subarray(0, this._length);
  }
  getPixel(a, b) {
    if (a instanceof Point) {
      return this._getPixelXY(a.x, a.y);
    }
    if (typeof a !== "number")
      throw new TypeError("Invalid arguments");
    if (b !== undefined) {
      return this._getPixelXY(a, b);
    }
    return this._getPixelXY(a, a);
  }
  _getPixelXY(x, y) {
    if (!this._data || x >= this._width || y >= this._height)
      return new Color;
    return Color._fromARGB(this._data[x + y * this._width]);
  }
  setPixel(a, b, c) {
    if (!this._data)
      return;
    if (typeof a === "number" && typeof b === "number" && c instanceof Color) {
      this._setPixelXY(a, b, c);
    } else if (a instanceof Point && b instanceof Color) {
      this._setPixelXY(a.x, a.y, b);
    } else if (typeof a === "number" && b instanceof Color) {
      this._setPixelXY(a, a, b);
    } else {
      throw new TypeError("Invalid arguments");
    }
  }
  _setPixelXY(x, y, c) {
    if (!this._data || x >= this._width || y >= this._height)
      return;
    this._data[x + y * this._width] = c.getARGB();
  }
  fill(...args) {
    const a0 = args[0];
    if (a0 === undefined)
      throw new TypeError("Invalid arguments");
    if (typeof a0 === "string")
      throw new TypeError("Invalid arguments");
    if (typeof a0 === "object" && a0 !== null && !(a0 instanceof Color) && !(("r" in a0) && ("g" in a0) && ("b" in a0))) {
      throw new TypeError("Invalid arguments");
    }
    const c = a0 instanceof Color ? a0 : new Color(...args);
    if (!this._data || this._length === 0)
      return false;
    const argb = c.getARGB();
    for (let i = 0;i < this._length; i++) {
      this._data[i] = argb;
    }
    return true;
  }
  swap(sw) {
    if (typeof sw !== "string")
      throw new TypeError("Invalid arguments");
    if (!this._data || this._length === 0 || !sw)
      return false;
    let a = -1, r = -1, g = -1, b = -1;
    let count = 0;
    for (count = 0;count < sw.length; count++) {
      const ch = sw[count].toLowerCase();
      if (ch === "a" && a === -1)
        a = 3 - count << 3;
      else if (ch === "r" && r === -1)
        r = 3 - count << 3;
      else if (ch === "g" && g === -1)
        g = 3 - count << 3;
      else if (ch === "b" && b === -1)
        b = 3 - count << 3;
      else
        return false;
    }
    if (count !== 4)
      return false;
    for (let i = 0;i < this._length; i++) {
      const px = this._data[i];
      const ca = px >>> 24 & 255;
      const cr = px >>> 16 & 255;
      const cg = px >>> 8 & 255;
      const cb = px & 255;
      this._data[i] = (ca << a | cr << r | cg << g | cb << b) >>> 0;
    }
    return true;
  }
  flip(h, v) {
    if (typeof h !== "boolean" || typeof v !== "boolean")
      throw new TypeError("Invalid arguments");
    if (!this._data || this._length === 0)
      return false;
    if (h && v)
      this._flipBoth();
    else if (h && !v)
      this._flipH();
    else if (!h && v)
      this._flipV();
    return true;
  }
  _flipBoth() {
    const len = Math.floor(this._length / 2);
    for (let i = 0;i < len; i++) {
      const f = this._length - 1 - i;
      const tmp = this._data[i];
      this._data[i] = this._data[f];
      this._data[f] = tmp;
    }
  }
  _flipH() {
    const half = Math.floor(this._width / 2);
    for (let y = 0;y < this._height; y++) {
      for (let x = 0;x < half; x++) {
        const f = this._width - 1 - x;
        const ai = x + y * this._width;
        const bi = f + y * this._width;
        const tmp = this._data[ai];
        this._data[ai] = this._data[bi];
        this._data[bi] = tmp;
      }
    }
  }
  _flipV() {
    const half = Math.floor(this._height / 2);
    for (let y = 0;y < half; y++) {
      const f = this._height - 1 - y;
      for (let x = 0;x < this._width; x++) {
        const ai = x + y * this._width;
        const bi = x + f * this._width;
        const tmp = this._data[ai];
        this._data[ai] = this._data[bi];
        this._data[bi] = tmp;
      }
    }
  }
  eq(other) {
    if (!(other instanceof Image))
      throw new TypeError("Invalid arguments");
    if (this._width !== other._width || this._height !== other._height)
      return false;
    if (!this._data && !other._data)
      return true;
    if (!this._data || !other._data)
      return false;
    for (let i = 0;i < this._length; i++) {
      if (this._data[i] !== other._data[i])
        return false;
    }
    return true;
  }
  ne(other) {
    return !this.eq(other);
  }
  clone() {
    return new Image(this);
  }
  toString() {
    return `[${this._width}x${this._height} - ${this._length}/${this._limit}]`;
  }
}
Color._fromARGB = function(argb) {
  const c = new Color;
  c.a = argb >>> 24 & 255;
  c.r = argb >>> 16 & 255;
  c.g = argb >>> 8 & 255;
  c.b = argb & 255;
  return c;
};

// lib/Timer.ts
var INVALID = -1;
function getCpuTimeMs() {
  return Math.floor(performance.now());
}
function sleepSync(ms) {
  if (ms <= 0)
    return;
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

class Timer {
  _started = INVALID;
  constructor(a) {
    if (a instanceof Timer) {
      this._started = a._started;
    }
  }
  start() {
    this._started = getCpuTimeMs();
  }
  reset() {
    if (this._started === INVALID)
      return 0;
    const old = this._started;
    this._started = INVALID;
    return getCpuTimeMs() - old;
  }
  restart() {
    if (this._started === INVALID) {
      this._started = getCpuTimeMs();
      return 0;
    }
    const old = this._started;
    this._started = getCpuTimeMs();
    return this._started - old;
  }
  getElapsed() {
    if (this._started === INVALID)
      return 0;
    return getCpuTimeMs() - this._started;
  }
  hasStarted() {
    return this._started !== INVALID;
  }
  hasExpired(time) {
    if (time === undefined || typeof time !== "number")
      throw new TypeError("Invalid arguments");
    if (this._started === INVALID)
      return true;
    return this.getElapsed() > time;
  }
  lt(other) {
    if (!(other instanceof Timer))
      throw new TypeError("Invalid arguments");
    if (other._started === INVALID)
      return false;
    if (this._started === INVALID)
      return true;
    return this._started > other._started;
  }
  gt(other) {
    if (!(other instanceof Timer))
      throw new TypeError("Invalid arguments");
    if (this._started === INVALID)
      return false;
    if (other._started === INVALID)
      return true;
    return this._started < other._started;
  }
  le(other) {
    if (!(other instanceof Timer))
      throw new TypeError("Invalid arguments");
    if (this._started === INVALID)
      return true;
    if (other._started === INVALID)
      return false;
    return this._started >= other._started;
  }
  ge(other) {
    if (!(other instanceof Timer))
      throw new TypeError("Invalid arguments");
    if (other._started === INVALID)
      return true;
    if (this._started === INVALID)
      return false;
    return this._started <= other._started;
  }
  eq(other) {
    if (!(other instanceof Timer))
      throw new TypeError("Invalid arguments");
    return this._started === other._started;
  }
  ne(other) {
    if (!(other instanceof Timer))
      throw new TypeError("Invalid arguments");
    return this._started !== other._started;
  }
  clone() {
    return new Timer(this);
  }
  static sleep(a, b) {
    if (typeof a !== "number" && !(a instanceof Range))
      throw new TypeError("Invalid arguments");
    let delay;
    if (a instanceof Range) {
      delay = a.getRandom();
    } else if (b !== undefined) {
      delay = new Range(a, b).getRandom();
    } else {
      delay = a;
    }
    if (delay < 0)
      return;
    sleepSync(delay);
  }
  static getCpuTime() {
    return getCpuTimeMs();
  }
  static compare(a, b) {
    if (a.lt(b))
      return -1;
    if (a.gt(b))
      return 1;
    return 0;
  }
}

// lib/Keyboard.ts
class Keyboard {
  autoDelay;
  _native;
  constructor(a) {
    const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
    this._native = getNativeBackend2();
    if (a instanceof Keyboard) {
      this.autoDelay = a.autoDelay.clone();
    } else {
      this.autoDelay = new Range(40, 90);
    }
  }
  click(key) {
    if (typeof key === "string") {
      const compiled = Keyboard.compile(key);
      for (const entry of compiled) {
        if (entry.down) {
          this._native.keyboard_press(entry.key);
        } else {
          this._native.keyboard_release(entry.key);
        }
        Timer.sleep(this.autoDelay);
      }
      return;
    }
    this._native.keyboard_click(key);
  }
  press(key) {
    this._native.keyboard_press(key);
  }
  release(key) {
    this._native.keyboard_release(key);
  }
  clone() {
    const copy = new Keyboard;
    copy.autoDelay = this.autoDelay.clone();
    return copy;
  }
  static compile(keys) {
    const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
    return getNativeBackend2().keyboard_compile(keys);
  }
  static getState(keycode) {
    const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
    const native = getNativeBackend2();
    if (keycode !== undefined) {
      return native.keyboard_getKeyState(keycode);
    }
    return native.keyboard_getState();
  }
}

// lib/Mouse.ts
init_Point();

class Mouse {
  autoDelay;
  _native;
  constructor(a) {
    const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
    this._native = getNativeBackend2();
    if (a instanceof Mouse) {
      this.autoDelay = a.autoDelay.clone();
    } else {
      this.autoDelay = new Range(40, 90);
    }
  }
  click(button) {
    this._native.mouse_click(button);
  }
  press(button) {
    this._native.mouse_press(button);
  }
  release(button) {
    this._native.mouse_release(button);
  }
  scrollH(amount) {
    this._native.mouse_scrollH(amount);
  }
  scrollV(amount) {
    this._native.mouse_scrollV(amount);
  }
  clone() {
    const copy = new Mouse;
    copy.autoDelay = this.autoDelay.clone();
    return copy;
  }
  static getPos() {
    const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
    const p = getNativeBackend2().mouse_getPos();
    return new Point(p.x, p.y);
  }
  static setPos(p, y) {
    const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
    const pt = Point._resolve(p, y);
    getNativeBackend2().mouse_setPos(pt.x, pt.y);
  }
  static getState(button) {
    const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
    const native = getNativeBackend2();
    if (button !== undefined) {
      return native.mouse_getButtonState(button);
    }
    return native.mouse_getState();
  }
}

// lib/Clipboard.ts
function getNative() {
  const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
  return getNativeBackend2();
}
var Clipboard = {
  clear() {
    return getNative().clipboard_clear();
  },
  hasText() {
    return getNative().clipboard_hasText();
  },
  getText() {
    return getNative().clipboard_getText();
  },
  setText(text) {
    if (typeof text !== "string")
      throw new TypeError("Invalid arguments");
    return getNative().clipboard_setText(text);
  },
  hasImage() {
    return getNative().clipboard_hasImage();
  },
  getImage(image) {
    image.destroy();
    const result = getNative().clipboard_getImage();
    if (!result)
      return false;
    image.create(result.width, result.height);
    const data = image.getData();
    if (data)
      data.set(result.data);
    return true;
  },
  setImage(image) {
    const data = image.getData();
    if (!data)
      return false;
    return getNative().clipboard_setImage(image.getWidth(), image.getHeight(), data);
  },
  getSequence() {
    return getNative().clipboard_getSequence();
  }
};

// lib/Screen.ts
init_Bounds();
init_Point();
function getNative2() {
  const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
  return getNativeBackend2();
}

class Screen {
  _bounds;
  _usable;
  constructor(a, b) {
    if (a instanceof Screen) {
      this._bounds = a._bounds.clone();
      this._usable = a._usable.clone();
    } else if (a instanceof Bounds && b instanceof Bounds) {
      this._bounds = a.clone();
      this._usable = b.clone();
    } else {
      this._bounds = new Bounds;
      this._usable = new Bounds;
    }
  }
  getBounds() {
    return this._bounds.clone();
  }
  getUsable() {
    return this._usable.clone();
  }
  isPortrait() {
    return this._bounds.getSize().h < this._bounds.getSize().w ? false : this._bounds.getSize().h > this._bounds.getSize().w ? true : false;
  }
  isLandscape() {
    return this._bounds.getSize().w < this._bounds.getSize().h ? false : this._bounds.getSize().w > this._bounds.getSize().h ? true : false;
  }
  clone() {
    return new Screen(this._bounds.clone(), this._usable.clone());
  }
  static _screens = [];
  static synchronize() {
    const result = getNative2().screen_synchronize();
    if (!result)
      return false;
    Screen._screens = result.map((s) => {
      const bounds = new Bounds(s.bounds.x, s.bounds.y, s.bounds.w, s.bounds.h);
      const usable = new Bounds(s.usable.x, s.usable.y, s.usable.w, s.usable.h);
      return new Screen(bounds, usable);
    });
    return true;
  }
  static getMain() {
    return Screen._screens.length > 0 ? Screen._screens[0] : null;
  }
  static getList() {
    return Screen._screens.slice();
  }
  static getScreen(a, b) {
    if (typeof a === "number" && typeof b === "number") {
      return Screen._getScreenForPoint(new Point(a, b));
    }
    if (a && typeof a.getBounds === "function" && typeof a.isValid === "function") {
      if (!a.isValid())
        return null;
      const bounds = a.getBounds();
      const cx = bounds.x + Math.floor(bounds.w / 2);
      const cy = bounds.y + Math.floor(bounds.h / 2);
      return Screen._getScreenForPoint(new Point(cx, cy));
    }
    const p = a instanceof Point ? a : new Point(a.x, a.y);
    return Screen._getScreenForPoint(p);
  }
  static _getScreenForPoint(p) {
    for (const s of Screen._screens) {
      if (s._bounds.containsP(p))
        return s;
    }
    return Screen.getMain();
  }
  static grabScreen(image, a, b, c, d, e) {
    image.destroy();
    let x, y, w, h;
    let windowHandle;
    if (a instanceof Bounds) {
      x = a.x;
      y = a.y;
      w = a.w;
      h = a.h;
      windowHandle = Screen._resolveWindowHandle(b);
    } else {
      x = a;
      y = b;
      w = c;
      h = d;
      windowHandle = Screen._resolveWindowHandle(e);
    }
    const result = getNative2().screen_grabScreen(x, y, w, h, windowHandle);
    if (!result)
      return false;
    image.create(w, h);
    const data = image.getData();
    if (data)
      data.set(result);
    return true;
  }
  static _resolveWindowHandle(w) {
    if (w === undefined || w === null)
      return;
    if (typeof w === "number")
      return w;
    if (typeof w.getHandle === "function")
      return w.getHandle();
    return;
  }
  static getTotalBounds() {
    const b = getNative2().screen_getTotalBounds();
    return new Bounds(b.x, b.y, b.w, b.h);
  }
  static getTotalUsable() {
    const u = getNative2().screen_getTotalUsable();
    return new Bounds(u.x, u.y, u.w, u.h);
  }
  static isCompositing() {
    return getNative2().screen_isCompositing();
  }
  static setCompositing(enabled) {
    getNative2().screen_setCompositing(enabled);
  }
}

// lib/index.ts
init_Window();
init_Process();

// lib/Module.ts
init_Process();

class Segment {
  valid = false;
  base = 0;
  size = 0;
  name = "";
  constructor() {
    if (!(this instanceof Segment)) {
      return new Segment;
    }
  }
  contains(value) {
    if (typeof value !== "number")
      throw new TypeError("Invalid arguments");
    const base = this.base;
    const stop = this.base + this.size;
    return base <= value && stop > value;
  }
  lt(value) {
    if (value instanceof Segment)
      return this.base < value.base;
    if (typeof value === "number")
      return this.base < value;
    throw new TypeError("Invalid arguments");
  }
  gt(value) {
    if (value instanceof Segment)
      return this.base > value.base;
    if (typeof value === "number")
      return this.base > value;
    throw new TypeError("Invalid arguments");
  }
  le(value) {
    if (value instanceof Segment)
      return this.base <= value.base;
    if (typeof value === "number")
      return this.base <= value;
    throw new TypeError("Invalid arguments");
  }
  ge(value) {
    if (value instanceof Segment)
      return this.base >= value.base;
    if (typeof value === "number")
      return this.base >= value;
    throw new TypeError("Invalid arguments");
  }
  eq(segment) {
    if (!(segment instanceof Segment))
      throw new TypeError("Invalid arguments");
    return this.valid === segment.valid && this.base === segment.base && this.size === segment.size && this.name === segment.name;
  }
  ne(segment) {
    if (!(segment instanceof Segment))
      throw new TypeError("Invalid arguments");
    return this.valid !== segment.valid || this.base !== segment.base || this.size !== segment.size || this.name !== segment.name;
  }
  clone() {
    const copy = new Segment;
    copy.valid = this.valid;
    copy.base = this.base;
    copy.size = this.size;
    copy.name = this.name;
    return copy;
  }
  static compare(a, b) {
    if (a.lt(b))
      return -1;
    if (a.gt(b))
      return 1;
    return 0;
  }
}

class Module {
  valid;
  name;
  path;
  base;
  size;
  process;
  _segments = null;
  _proc = null;
  constructor(a, b, c, d, e) {
    if (a instanceof Module) {
      this.valid = a.valid;
      this.name = a.name;
      this.path = a.path;
      this.base = a.base;
      this.size = a.size;
      this.process = a.process;
    } else if (a instanceof Process && typeof b === "string") {
      this.valid = true;
      this.name = b;
      this.path = c || "";
      this.base = d || 0;
      this.size = e || 0;
      this.process = a;
    } else if (a && typeof a === "object" && "pid" in a) {
      this.valid = a.valid;
      this.name = a.name;
      this.path = a.path;
      this.base = a.base;
      this.size = a.size;
      this.process = new Process(a.pid);
    } else {
      this.valid = false;
      this.name = "";
      this.path = "";
      this.base = 0;
      this.size = 0;
      this.process = new Process;
    }
  }
  isValid() {
    return this.valid;
  }
  getName() {
    return this.name;
  }
  getPath() {
    return this.path;
  }
  getBase() {
    return this.base;
  }
  getSize() {
    return this.size;
  }
  getProcess() {
    return this.process;
  }
  contains(address) {
    return address >= this.base && address < this.base + this.size;
  }
  lt(value) {
    if (value instanceof Module)
      return this.base < value.base;
    if (typeof value === "number")
      return this.base < value;
    throw new TypeError("Invalid arguments");
  }
  gt(value) {
    if (value instanceof Module)
      return this.base > value.base;
    if (typeof value === "number")
      return this.base > value;
    throw new TypeError("Invalid arguments");
  }
  le(value) {
    if (value instanceof Module)
      return this.base <= value.base;
    if (typeof value === "number")
      return this.base <= value;
    throw new TypeError("Invalid arguments");
  }
  ge(value) {
    if (value instanceof Module)
      return this.base >= value.base;
    if (typeof value === "number")
      return this.base >= value;
    throw new TypeError("Invalid arguments");
  }
  eq(value) {
    if (value instanceof Module)
      return this.base === value.base;
    if (typeof value === "number")
      return this.base === value;
    throw new TypeError("Invalid arguments");
  }
  ne(value) {
    if (value instanceof Module)
      return this.base !== value.base;
    if (typeof value === "number")
      return this.base !== value;
    throw new TypeError("Invalid arguments");
  }
  getSegments() {
    if (!this.valid)
      return [];
    if (this._segments === null) {
      const proc = this._proc || this.process;
      const rawSegs = Process._getSegments(proc, this.base);
      this._segments = rawSegs.map((s) => {
        const seg = new Segment;
        seg.valid = s.valid;
        seg.base = s.base;
        seg.size = s.size;
        seg.name = s.name;
        return seg;
      });
    }
    return this._segments;
  }
  clone() {
    const copy = new Module(this);
    if (this._segments !== null && this._segments !== undefined) {
      copy._segments = this._segments.map((s) => s.clone());
    } else {
      copy._segments = null;
    }
    return copy;
  }
  static compare(a, b) {
    if (a.lt(b))
      return -1;
    if (a.gt(b))
      return 1;
    return 0;
  }
}

// lib/Memory.ts
init_Process();
function getNative5() {
  const { getNativeBackend: getNativeBackend2 } = __toCommonJS(exports_native);
  return getNativeBackend2();
}

class Stats {
  systemReads = 0;
  cachedReads = 0;
  systemWrites = 0;
  accessWrites = 0;
  readErrors = 0;
  writeErrors = 0;
  eq(other) {
    if (!(other instanceof Stats))
      throw new TypeError("Invalid arguments");
    return this.systemReads === other.systemReads && this.cachedReads === other.cachedReads && this.systemWrites === other.systemWrites && this.accessWrites === other.accessWrites && this.readErrors === other.readErrors && this.writeErrors === other.writeErrors;
  }
  ne(other) {
    return !this.eq(other);
  }
  clone() {
    const copy = new Stats;
    copy.systemReads = this.systemReads;
    copy.cachedReads = this.cachedReads;
    copy.systemWrites = this.systemWrites;
    copy.accessWrites = this.accessWrites;
    copy.readErrors = this.readErrors;
    copy.writeErrors = this.writeErrors;
    return copy;
  }
}

class Region {
  valid = false;
  bound = false;
  start = 0;
  stop = 0;
  size = 0;
  readable = false;
  writable = false;
  executable = false;
  access = 0;
  private = false;
  guarded = false;
  contains(address) {
    return address >= this.start && address < this.stop;
  }
  lt(value) {
    if (value instanceof Region)
      return this.start < value.start;
    if (typeof value === "number")
      return this.start < value;
    throw new TypeError("Invalid arguments");
  }
  gt(value) {
    if (value instanceof Region)
      return this.start > value.start;
    if (typeof value === "number")
      return this.start > value;
    throw new TypeError("Invalid arguments");
  }
  le(value) {
    if (value instanceof Region)
      return this.start <= value.start;
    if (typeof value === "number")
      return this.start <= value;
    throw new TypeError("Invalid arguments");
  }
  ge(value) {
    if (value instanceof Region)
      return this.start >= value.start;
    if (typeof value === "number")
      return this.start >= value;
    throw new TypeError("Invalid arguments");
  }
  eq(value) {
    if (value instanceof Region)
      return this.start === value.start && this.size === value.size;
    if (typeof value === "number")
      return this.start === value;
    throw new TypeError("Invalid arguments");
  }
  ne(value) {
    if (value instanceof Region)
      return this.start !== value.start || this.size !== value.size;
    if (typeof value === "number")
      return this.start !== value;
    throw new TypeError("Invalid arguments");
  }
  clone() {
    const copy = new Region;
    copy.valid = this.valid;
    copy.bound = this.bound;
    copy.start = this.start;
    copy.stop = this.stop;
    copy.size = this.size;
    copy.readable = this.readable;
    copy.writable = this.writable;
    copy.executable = this.executable;
    copy.access = this.access;
    copy["private"] = this["private"];
    copy.guarded = this.guarded;
    return copy;
  }
  static compare(a, b) {
    if (a.lt(b))
      return -1;
    if (a.gt(b))
      return 1;
    return 0;
  }
}
class Memory {
  static DEFAULT = 0;
  static SKIP_ERRORS = 1;
  static AUTO_ACCESS = 2;
  static Stats = Stats;
  static Region = Region;
  _pid;
  constructor(process2) {
    if (process2 instanceof Memory) {
      this._pid = process2._pid;
    } else if (process2 instanceof Process) {
      this._pid = process2.getPID();
    } else {
      this._pid = 0;
    }
  }
  isValid() {
    return getNative5().memory_isValid(this._pid);
  }
  getProcess() {
    return new Process(this._pid);
  }
  getStats(reset) {
    return new Stats;
  }
  getRegion(address) {
    const r = getNative5().memory_getRegion(this._pid, address);
    const region = new Region;
    region.valid = r.valid;
    region.bound = r.bound;
    region.start = r.start;
    region.stop = r.stop;
    region.size = r.size;
    region.readable = r.readable;
    region.writable = r.writable;
    region.executable = r.executable;
    region.access = r.access;
    region["private"] = r["private"];
    region.guarded = r.guarded;
    return region;
  }
  getRegions(start, stop) {
    const regions = getNative5().memory_getRegions(this._pid, start, stop);
    return regions.map((r) => {
      const region = new Region;
      region.valid = r.valid;
      region.bound = r.bound;
      region.start = r.start;
      region.stop = r.stop;
      region.size = r.size;
      region.readable = r.readable;
      region.writable = r.writable;
      region.executable = r.executable;
      region.access = r.access;
      region["private"] = r["private"];
      region.guarded = r.guarded;
      return region;
    });
  }
  setAccess(region, a, b, c) {
    if (typeof a === "number") {
      return getNative5().memory_setAccessFlags(this._pid, region.start, a);
    }
    return getNative5().memory_setAccess(this._pid, region.start, a, b, c);
  }
  getPtrSize() {
    return getNative5().memory_getPtrSize(this._pid);
  }
  getMinAddress() {
    return getNative5().memory_getMinAddress(this._pid);
  }
  getMaxAddress() {
    return getNative5().memory_getMaxAddress(this._pid);
  }
  getPageSize() {
    return getNative5().memory_getPageSize(this._pid);
  }
  find(pattern, start, stop, limit, flags) {
    return getNative5().memory_find(this._pid, pattern, start, stop, limit, flags);
  }
  createCache(address, size, blockSize, maxBlocks, flags) {
    return getNative5().memory_createCache(this._pid, address, size, blockSize, maxBlocks, flags);
  }
  clearCache() {
    getNative5().memory_clearCache(this._pid);
  }
  deleteCache() {
    getNative5().memory_deleteCache(this._pid);
  }
  isCaching() {
    return getNative5().memory_isCaching(this._pid);
  }
  getCacheSize() {
    return getNative5().memory_getCacheSize(this._pid);
  }
  readData(address, buffer, length, flags) {
    const len = length !== undefined ? length : buffer.length;
    if (buffer.length < len)
      throw new RangeError("Buffer is too small");
    const result = getNative5().memory_readData(this._pid, address, len, flags);
    if (!result)
      return 0;
    result.copy(buffer, 0, 0, len);
    return len;
  }
  writeData(address, buffer, length, flags) {
    const len = length !== undefined ? length : buffer.length;
    if (buffer.length < len)
      throw new RangeError("Buffer is too small");
    return getNative5().memory_writeData(this._pid, address, buffer, flags);
  }
  readInt8(address, count, stride) {
    return this._readType(address, 1 /* Int8 */, 1, count, stride);
  }
  readInt16(address, count, stride) {
    return this._readType(address, 2 /* Int16 */, 2, count, stride);
  }
  readInt32(address, count, stride) {
    return this._readType(address, 3 /* Int32 */, 4, count, stride);
  }
  readInt64(address, count, stride) {
    return this._readType(address, 4 /* Int64 */, 8, count, stride);
  }
  readReal32(address, count, stride) {
    return this._readType(address, 5 /* Real32 */, 4, count, stride);
  }
  readReal64(address, count, stride) {
    return this._readType(address, 6 /* Real64 */, 8, count, stride);
  }
  readBool(address, count, stride) {
    return this._readType(address, 7 /* Bool */, 1, count, stride);
  }
  readString(address, length, count, stride) {
    return this._readType(address, 8 /* String */, length, count, stride);
  }
  readPtr(address, count, stride) {
    const ptrSize = this.getPtrSize();
    return this._readType(address, ptrSize === 4 ? 3 /* Int32 */ : 4 /* Int64 */, ptrSize, count, stride);
  }
  writeInt8(address, value) {
    return this._writeType(address, value, 1 /* Int8 */, 1);
  }
  writeInt16(address, value) {
    return this._writeType(address, value, 2 /* Int16 */, 2);
  }
  writeInt32(address, value) {
    return this._writeType(address, value, 3 /* Int32 */, 4);
  }
  writeInt64(address, value) {
    return this._writeType(address, value, 4 /* Int64 */, 8);
  }
  writeReal32(address, value) {
    return this._writeType(address, value, 5 /* Real32 */, 4);
  }
  writeReal64(address, value) {
    return this._writeType(address, value, 6 /* Real64 */, 8);
  }
  writeBool(address, value) {
    return this._writeType(address, value, 7 /* Bool */, 1);
  }
  writeString(address, value, length) {
    return this._writeType(address, value, 8 /* String */, length || 0);
  }
  writePtr(address, value) {
    const ptrSize = this.getPtrSize();
    return this._writeType(address, value, ptrSize === 4 ? 3 /* Int32 */ : 4 /* Int64 */, ptrSize);
  }
  clone() {
    return new Memory(new Process(this._pid));
  }
  _readType(address, type, length, count, stride) {
    const native = getNative5();
    const c = count || 1;
    const s = stride || 0;
    if (c === 0 || length === 0)
      return null;
    if (c === 1) {
      const buf2 = native.memory_readData(this._pid, address, length);
      if (!buf2)
        return null;
      switch (type) {
        case 1 /* Int8 */:
          return buf2.readInt8(0);
        case 2 /* Int16 */:
          return buf2.readInt16LE(0);
        case 3 /* Int32 */:
          return buf2.readInt32LE(0);
        case 4 /* Int64 */:
          return Number(buf2.readBigInt64LE(0));
        case 5 /* Real32 */:
          return buf2.readFloatLE(0);
        case 6 /* Real64 */:
          return buf2.readDoubleLE(0);
        case 7 /* Bool */:
          return buf2[0] !== 0;
        case 8 /* String */:
          return buf2.toString("utf8", 0, length);
        default:
          return null;
      }
    }
    const effectiveStride = s === 0 ? length : s;
    if (effectiveStride < length)
      throw new RangeError("Stride is too small");
    const totalSize = c * effectiveStride + length - effectiveStride;
    const buf = native.memory_readData(this._pid, address, totalSize);
    if (!buf)
      return null;
    const result = [];
    for (let i = 0;i < c; i++) {
      const offset = i * effectiveStride;
      switch (type) {
        case 1 /* Int8 */:
          result.push(buf.readInt8(offset));
          break;
        case 2 /* Int16 */:
          result.push(buf.readInt16LE(offset));
          break;
        case 3 /* Int32 */:
          result.push(buf.readInt32LE(offset));
          break;
        case 4 /* Int64 */:
          result.push(Number(buf.readBigInt64LE(offset)));
          break;
        case 5 /* Real32 */:
          result.push(buf.readFloatLE(offset));
          break;
        case 6 /* Real64 */:
          result.push(buf.readDoubleLE(offset));
          break;
        case 7 /* Bool */:
          result.push(buf[offset] !== 0);
          break;
        case 8 /* String */:
          result.push(buf.toString("utf8", offset, offset + length));
          break;
      }
    }
    return result;
  }
  _writeType(address, value, type, length) {
    const native = getNative5();
    if (type === 8 /* String */) {
      const str = value;
      const len = length === 0 ? str.length + 1 : length;
      if (len === 0)
        return true;
      if (len > str.length + 1)
        throw new RangeError("Length is too large");
      const buf2 = Buffer.alloc(len);
      buf2.write(str, 0, len, "utf8");
      return native.memory_writeData(this._pid, address, buf2) === len;
    }
    const buf = Buffer.alloc(length);
    switch (type) {
      case 1 /* Int8 */:
        buf.writeInt8(value, 0);
        break;
      case 2 /* Int16 */:
        buf.writeInt16LE(value, 0);
        break;
      case 3 /* Int32 */:
        buf.writeInt32LE(value, 0);
        break;
      case 4 /* Int64 */:
        buf.writeBigInt64LE(BigInt(Math.trunc(value)), 0);
        break;
      case 5 /* Real32 */:
        buf.writeFloatLE(value, 0);
        break;
      case 6 /* Real64 */:
        buf.writeDoubleLE(value, 0);
        break;
      case 7 /* Bool */:
        buf[0] = value ? 1 : 0;
        break;
      default:
        return false;
    }
    return native.memory_writeData(this._pid, address, buf) === length;
  }
}

// lib/index.ts
var __dirname = "/home/user/mechatron/lib";
var ROBOT_VERSION = 131072;
var ROBOT_VERSION_STR = "2.0.0 (0.0.0)";
var ADDON_VERSION = 0;
var ADDON_VERSION_STR = "0.0.0";
function getConstants() {
  try {
    const addon = require("node-gyp-build")(require("path").resolve(__dirname, ".."));
    const constants = {};
    for (const key of Object.keys(addon)) {
      if ((key.startsWith("KEY_") || key.startsWith("BUTTON_")) && typeof addon[key] === "number") {
        constants[key] = addon[key];
      }
    }
    return constants;
  } catch {
    return _fallbackKeys;
  }
}
var _fallbackKeys = {
  KEY_SPACE: 32,
  KEY_ESCAPE: 65307,
  KEY_TAB: 65289,
  KEY_ALT: 65513,
  KEY_LALT: 65513,
  KEY_RALT: 65514,
  KEY_CONTROL: 65507,
  KEY_LCONTROL: 65507,
  KEY_RCONTROL: 65508,
  KEY_SHIFT: 65505,
  KEY_LSHIFT: 65505,
  KEY_RSHIFT: 65506,
  KEY_SYSTEM: 65515,
  KEY_LSYSTEM: 65515,
  KEY_RSYSTEM: 65516,
  KEY_F1: 65470,
  KEY_F2: 65471,
  KEY_F3: 65472,
  KEY_F4: 65473,
  KEY_F5: 65474,
  KEY_F6: 65475,
  KEY_F7: 65476,
  KEY_F8: 65477,
  KEY_F9: 65478,
  KEY_F10: 65479,
  KEY_F11: 65480,
  KEY_F12: 65481,
  KEY_0: 48,
  KEY_1: 49,
  KEY_2: 50,
  KEY_3: 51,
  KEY_4: 52,
  KEY_5: 53,
  KEY_6: 54,
  KEY_7: 55,
  KEY_8: 56,
  KEY_9: 57,
  KEY_A: 97,
  KEY_B: 98,
  KEY_C: 99,
  KEY_D: 100,
  KEY_E: 101,
  KEY_F: 102,
  KEY_G: 103,
  KEY_H: 104,
  KEY_I: 105,
  KEY_J: 106,
  KEY_K: 107,
  KEY_L: 108,
  KEY_M: 109,
  KEY_N: 110,
  KEY_O: 111,
  KEY_P: 112,
  KEY_Q: 113,
  KEY_R: 114,
  KEY_S: 115,
  KEY_T: 116,
  KEY_U: 117,
  KEY_V: 118,
  KEY_W: 119,
  KEY_X: 120,
  KEY_Y: 121,
  KEY_Z: 122,
  KEY_GRAVE: 96,
  KEY_MINUS: 45,
  KEY_EQUAL: 61,
  KEY_BACKSPACE: 65288,
  KEY_LBRACKET: 91,
  KEY_RBRACKET: 93,
  KEY_BACKSLASH: 92,
  KEY_SEMICOLON: 59,
  KEY_QUOTE: 39,
  KEY_RETURN: 65293,
  KEY_COMMA: 44,
  KEY_PERIOD: 46,
  KEY_SLASH: 47,
  KEY_LEFT: 65361,
  KEY_UP: 65362,
  KEY_RIGHT: 65363,
  KEY_DOWN: 65364,
  KEY_PRINT: 65377,
  KEY_PAUSE: 65299,
  KEY_INSERT: 65379,
  KEY_DELETE: 65535,
  KEY_HOME: 65360,
  KEY_END: 65367,
  KEY_PAGE_UP: 65365,
  KEY_PAGE_DOWN: 65366,
  KEY_ADD: 65451,
  KEY_SUBTRACT: 65453,
  KEY_MULTIPLY: 65450,
  KEY_DIVIDE: 65455,
  KEY_DECIMAL: 65454,
  KEY_ENTER: 65421,
  KEY_NUM0: 65456,
  KEY_NUM1: 65457,
  KEY_NUM2: 65458,
  KEY_NUM3: 65459,
  KEY_NUM4: 65460,
  KEY_NUM5: 65461,
  KEY_NUM6: 65462,
  KEY_NUM7: 65463,
  KEY_NUM8: 65464,
  KEY_NUM9: 65465,
  KEY_CAPS_LOCK: 65509,
  KEY_SCROLL_LOCK: 65300,
  KEY_NUM_LOCK: 65407
};
var _fallbackButtons = {
  BUTTON_LEFT: 0,
  BUTTON_MID: 1,
  BUTTON_MIDDLE: 1,
  BUTTON_RIGHT: 2,
  BUTTON_X1: 3,
  BUTTON_X2: 4
};
function callableClass(Cls) {
  return new Proxy(Cls, {
    apply(_target, _thisArg, args) {
      return new Cls(...args);
    }
  });
}
function sleep(a, b) {
  Timer.sleep(a, b);
}
function clock() {
  return Timer.getCpuTime();
}
var CallableSegment = callableClass(Segment);
var CallableStats = callableClass(Stats);
var CallableRegion = callableClass(Region);
Module.Segment = CallableSegment;
Memory.Stats = CallableStats;
Memory.Region = CallableRegion;
var _origGetModules = Process.prototype.getModules;
Process.prototype.getModules = function(regex) {
  const rawModules = _origGetModules.call(this, regex);
  return rawModules.map((m) => {
    const mod = new Module(m);
    mod._segments = null;
    mod._proc = this;
    return mod;
  });
};
var _nativeConstants = getConstants();
var mRobot = {
  ROBOT_VERSION,
  ROBOT_VERSION_STR,
  ADDON_VERSION,
  ADDON_VERSION_STR,
  sleep,
  clock,
  Bounds: callableClass(Bounds),
  Clipboard,
  Color: callableClass(Color),
  Hash: callableClass(Hash),
  Image: callableClass(Image),
  Keyboard: callableClass(Keyboard),
  Memory: callableClass(Memory),
  Module: callableClass(Module),
  Mouse: callableClass(Mouse),
  Point: callableClass(Point),
  Process: callableClass(Process),
  Range: callableClass(Range),
  Screen: callableClass(Screen),
  Size: callableClass(Size),
  Timer: callableClass(Timer),
  Window: callableClass(Window),
  ..._fallbackButtons,
  ..._nativeConstants,
  getNativeBackend,
  setNativeBackend
};
module.exports = mRobot;
