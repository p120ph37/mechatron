import { Bounds } from "./Bounds";
import { Image } from "./Image";
import { Point } from "./Point";
import type { NativeBackend } from "./native";

function getNative(): NativeBackend {
  const { getNativeBackend } = require("./native");
  return getNativeBackend();
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

  static synchronize(): boolean {
    const result = getNative().screen_synchronize();
    if (!result) return false;
    Screen._screens = result.map((s) => {
      const bounds = new Bounds(s.bounds.x, s.bounds.y, s.bounds.w, s.bounds.h);
      const usable = new Bounds(s.usable.x, s.usable.y, s.usable.w, s.usable.h);
      return new Screen(bounds, usable);
    });
    return true;
  }

  static getMain(): Screen | null {
    return Screen._screens.length > 0 ? Screen._screens[0] : null;
  }

  static getList(): Screen[] {
    return Screen._screens.slice();
  }

  static getScreen(target: { x: number; y: number } | Point): Screen | null {
    const p = target instanceof Point ? target : new Point(target.x, target.y);
    for (const s of Screen._screens) {
      if (s._bounds.containsP(p)) return s;
    }
    return Screen.getMain();
  }

  static grabScreen(image: Image, x: number, y: number, w: number, h: number, windowHandle?: number): boolean;
  static grabScreen(image: Image, bounds: Bounds, windowHandle?: number): boolean;
  static grabScreen(image: Image, a: number | Bounds, b?: number | number, c?: number, d?: number, e?: number): boolean {
    image.destroy();
    let x: number, y: number, w: number, h: number;
    let windowHandle: number | undefined;
    if (a instanceof Bounds) {
      x = a.x; y = a.y; w = a.w; h = a.h;
      windowHandle = b as number | undefined;
    } else {
      x = a; y = b as number; w = c!; h = d!;
      windowHandle = e;
    }
    const result = getNative().screen_grabScreen(x, y, w, h, windowHandle);
    if (!result) return false;
    image.create(w, h);
    const data = image.getData();
    if (data) data.set(result);
    return true;
  }

  static getTotalBounds(): Bounds {
    const b = getNative().screen_getTotalBounds();
    return new Bounds(b.x, b.y, b.w, b.h);
  }

  static getTotalUsable(): Bounds {
    const u = getNative().screen_getTotalUsable();
    return new Bounds(u.x, u.y, u.w, u.h);
  }

  static isCompositing(): boolean {
    return getNative().screen_isCompositing();
  }

  static setCompositing(enabled: boolean): void {
    getNative().screen_setCompositing(enabled);
  }
}
