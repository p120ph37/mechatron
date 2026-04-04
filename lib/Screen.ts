import { Bounds } from "./Bounds";
import { Image } from "./Image";
import { Point } from "./Point";
import type { NativeBackend } from "./native";

function getNative(): NativeBackend {
  const { getNativeBackend } = require("./native");
  return getNativeBackend();
}

// Union two bounds rectangles
function unionBounds(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  if (a.w === 0 && a.h === 0) return b;
  if (b.w === 0 && b.h === 0) return a;
  const l = Math.min(a.x, b.x);
  const t = Math.min(a.y, b.y);
  const r = Math.max(a.x + a.w, b.x + b.w);
  const bot = Math.max(a.y + a.h, b.y + b.h);
  return { x: l, y: t, w: r - l, h: bot - t };
}

export class Screen {
  private _bounds: Bounds;
  private _usable: Bounds;

  constructor();
  constructor(other: Screen);
  constructor(bounds: Bounds, usable: Bounds);
  constructor(a?: Screen | Bounds, b?: Bounds) {
    if (a instanceof Screen) {
      this._bounds = a._bounds.clone();
      this._usable = a._usable.clone();
    } else if (a instanceof Bounds && b instanceof Bounds) {
      this._bounds = a.clone();
      this._usable = b.clone();
    } else {
      this._bounds = new Bounds();
      this._usable = new Bounds();
    }
  }

  getBounds(): Bounds {
    return this._bounds.clone();
  }

  getUsable(): Bounds {
    return this._usable.clone();
  }

  isPortrait(): boolean {
    return this._bounds.getSize().h < this._bounds.getSize().w ? false :
           this._bounds.getSize().h > this._bounds.getSize().w ? true : false;
  }

  isLandscape(): boolean {
    return this._bounds.getSize().w < this._bounds.getSize().h ? false :
           this._bounds.getSize().w > this._bounds.getSize().h ? true : false;
  }

  clone(): Screen {
    return new Screen(this._bounds.clone(), this._usable.clone());
  }

  // --- Static state ---
  private static _screens: Screen[] = [];
  private static _totalBounds: Bounds = new Bounds();
  private static _totalUsable: Bounds = new Bounds();

  static synchronize(): boolean {
    const result = getNative().screen_synchronize();
    if (!result) return false;
    let tb = { x: 0, y: 0, w: 0, h: 0 };
    let tu = { x: 0, y: 0, w: 0, h: 0 };
    Screen._screens = result.map((s) => {
      tb = unionBounds(tb, s.bounds);
      tu = unionBounds(tu, s.usable);
      const bounds = new Bounds(s.bounds.x, s.bounds.y, s.bounds.w, s.bounds.h);
      const usable = new Bounds(s.usable.x, s.usable.y, s.usable.w, s.usable.h);
      return new Screen(bounds, usable);
    });
    Screen._totalBounds = new Bounds(tb.x, tb.y, tb.w, tb.h);
    Screen._totalUsable = new Bounds(tu.x, tu.y, tu.w, tu.h);
    return true;
  }

  static getMain(): Screen | null {
    return Screen._screens.length > 0 ? Screen._screens[0] : null;
  }

  static getList(): Screen[] {
    return Screen._screens.slice();
  }

  static getScreen(target: { x: number; y: number } | Point): Screen | null;
  static getScreen(x: number, y: number): Screen | null;
  static getScreen(window: any): Screen | null;
  static getScreen(a: any, b?: number): Screen | null {
    if (typeof a === "number" && typeof b === "number") {
      return Screen._getScreenForPoint(new Point(a, b));
    }
    // Window-like object with getBounds()
    if (a && typeof a.getBounds === "function" && typeof a.isValid === "function") {
      if (!a.isValid()) return null;
      const bounds = a.getBounds();
      // Use center of window bounds
      const cx = bounds.x + Math.floor(bounds.w / 2);
      const cy = bounds.y + Math.floor(bounds.h / 2);
      return Screen._getScreenForPoint(new Point(cx, cy));
    }
    // Point-like
    const p = a instanceof Point ? a : new Point(a.x, a.y);
    return Screen._getScreenForPoint(p);
  }

  private static _getScreenForPoint(p: Point): Screen | null {
    for (const s of Screen._screens) {
      if (s._bounds.containsP(p)) return s;
    }
    return Screen.getMain();
  }

  static grabScreen(image: Image, x: number, y: number, w: number, h: number, window?: any): boolean;
  static grabScreen(image: Image, bounds: Bounds, window?: any): boolean;
  static grabScreen(image: Image, a: number | Bounds, b?: any, c?: number, d?: number, e?: any): boolean {
    image.destroy();
    let x: number, y: number, w: number, h: number;
    let windowHandle: number | undefined;
    if (a instanceof Bounds) {
      x = a.x; y = a.y; w = a.w; h = a.h;
      windowHandle = Screen._resolveWindowHandle(b);
    } else {
      x = a; y = b as number; w = c!; h = d!;
      windowHandle = Screen._resolveWindowHandle(e);
    }
    const result = getNative().screen_grabScreen(x, y, w, h, windowHandle);
    if (!result) return false;
    image.create(w, h);
    const data = image.getData();
    if (data) data.set(result);
    return true;
  }

  private static _resolveWindowHandle(w: any): number | undefined {
    if (w === undefined || w === null) return undefined;
    if (typeof w === "number") return w;
    if (typeof w.getHandle === "function") return w.getHandle();
    return undefined;
  }

  // Computed in TS from synchronize data (no longer delegated to native)
  static getTotalBounds(): Bounds {
    return Screen._totalBounds.clone();
  }

  static getTotalUsable(): Bounds {
    return Screen._totalUsable.clone();
  }

  // Compositing detection — implemented in TS via platform check
  // macOS and modern Linux always composite; Windows 8+ has DWM always on
  static isCompositing(): boolean {
    return true;
  }

  static setCompositing(_enabled: boolean): void {
    // No-op on all modern platforms
  }
}
