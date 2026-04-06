import { Range, Point, Timer } from "../types";
import { getNative } from "../napi";
import { BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2 } from "./constants";

const ALL_BUTTONS = [BUTTON_LEFT, BUTTON_MID, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2];

export class Mouse {
  autoDelay: Range;
  private _native: any;

  constructor();
  constructor(other: Mouse);
  constructor(a?: Mouse) {
    this._native = getNative("mouse");
    if (a instanceof Mouse) {
      this.autoDelay = a.autoDelay.clone();
    } else {
      this.autoDelay = new Range(40, 90);
    }
  }

  click(button: number): void {
    this._native.mouse_press(button);
    Timer.sleep(this.autoDelay);
    this._native.mouse_release(button);
    Timer.sleep(this.autoDelay);
  }

  press(button: number): void {
    this._native.mouse_press(button);
    Timer.sleep(this.autoDelay);
  }

  release(button: number): void {
    this._native.mouse_release(button);
    Timer.sleep(this.autoDelay);
  }

  scrollH(amount: number): void {
    this._native.mouse_scrollH(amount);
    Timer.sleep(this.autoDelay);
  }

  scrollV(amount: number): void {
    this._native.mouse_scrollV(amount);
    Timer.sleep(this.autoDelay);
  }

  clone(): Mouse {
    const copy = new Mouse();
    copy.autoDelay = this.autoDelay.clone();
    return copy;
  }

  static getPos(): Point {
    const p = getNative("mouse").mouse_getPos();
    return new Point(p.x, p.y);
  }

  static setPos(p: Point | { x: number; y: number } | number, y?: number): void {
    const pt = Point._resolve(p, y);
    getNative("mouse").mouse_setPos(pt.x, pt.y);
  }

  static getState(button?: number): Record<number, boolean> | boolean {
    const native = getNative("mouse");
    if (button !== undefined) {
      return native.mouse_getButtonState(button);
    }
    const state: Record<number, boolean> = {};
    for (const btn of ALL_BUTTONS) {
      state[btn] = native.mouse_getButtonState(btn);
    }
    return state;
  }
}
