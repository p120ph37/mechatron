import { Range, Point, Timer } from "../types";
import { getNative } from "../backend";
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

  async click(button: number): Promise<void> {
    await this._native.mouse_press(button);
    await Timer.delay(this.autoDelay);
    await this._native.mouse_release(button);
    await Timer.delay(this.autoDelay);
  }

  async press(button: number): Promise<void> {
    await this._native.mouse_press(button);
    await Timer.delay(this.autoDelay);
  }

  async release(button: number): Promise<void> {
    await this._native.mouse_release(button);
    await Timer.delay(this.autoDelay);
  }

  async scrollH(amount: number): Promise<void> {
    await this._native.mouse_scrollH(amount);
    await Timer.delay(this.autoDelay);
  }

  async scrollV(amount: number): Promise<void> {
    await this._native.mouse_scrollV(amount);
    await Timer.delay(this.autoDelay);
  }

  clone(): Mouse {
    const copy = new Mouse();
    copy.autoDelay = this.autoDelay.clone();
    return copy;
  }

  static async getPos(): Promise<Point> {
    const p = await getNative("mouse").mouse_getPos();
    return new Point(p.x, p.y);
  }

  static async setPos(p: Point | { x: number; y: number } | number, y?: number): Promise<void> {
    const pt = Point._resolve(p, y);
    await getNative("mouse").mouse_setPos(pt.x, pt.y);
  }

  static async getState(button?: number): Promise<Record<number, boolean> | boolean> {
    const native = getNative("mouse");
    if (button !== undefined) {
      return await native.mouse_getButtonState(button);
    }
    const state: Record<number, boolean> = {};
    for (const btn of ALL_BUTTONS) {
      state[btn] = await native.mouse_getButtonState(btn);
    }
    return state;
  }
}
