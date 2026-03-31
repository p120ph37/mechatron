import { Range } from "./Range";
import { Point } from "./Point";
import type { NativeBackend } from "./native";

export class Mouse {
  autoDelay: Range;
  private _native: NativeBackend;

  constructor();
  constructor(other: Mouse);
  constructor(a?: Mouse) {
    const { getNativeBackend } = require("./native");
    this._native = getNativeBackend();
    if (a instanceof Mouse) {
      this.autoDelay = a.autoDelay.clone();
    } else {
      this.autoDelay = new Range(40, 90);
    }
  }

  click(button: number): void {
    this._native.mouse_click(button);
  }

  press(button: number): void {
    this._native.mouse_press(button);
  }

  release(button: number): void {
    this._native.mouse_release(button);
  }

  scrollH(amount: number): void {
    this._native.mouse_scrollH(amount);
  }

  scrollV(amount: number): void {
    this._native.mouse_scrollV(amount);
  }

  clone(): Mouse {
    const copy = new Mouse();
    copy.autoDelay = this.autoDelay.clone();
    return copy;
  }

  static getPos(): Point {
    const { getNativeBackend } = require("./native");
    const p = getNativeBackend().mouse_getPos();
    return new Point(p.x, p.y);
  }

  static setPos(p: Point | { x: number; y: number } | number, y?: number): void {
    const { getNativeBackend } = require("./native");
    const pt = Point._resolve(p, y);
    getNativeBackend().mouse_setPos(pt.x, pt.y);
  }

  static getState(button?: number): Record<number, boolean> | boolean {
    const { getNativeBackend } = require("./native");
    const native = getNativeBackend();
    if (button !== undefined) {
      return native.mouse_getButtonState(button);
    }
    return native.mouse_getState();
  }
}
