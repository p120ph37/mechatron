import { Range } from "./Range";
import { Timer } from "./Timer";
import type { NativeBackend } from "./native";

export class Keyboard {
  autoDelay: Range;
  private _native: NativeBackend;

  constructor();
  constructor(other: Keyboard);
  constructor(a?: Keyboard) {
    // Lazy import to avoid circular dependency at module load
    const { getNativeBackend } = require("./native");
    this._native = getNativeBackend();
    if (a instanceof Keyboard) {
      this.autoDelay = a.autoDelay.clone();
    } else {
      this.autoDelay = new Range(40, 90);
    }
  }

  click(key: number | string): void {
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

  press(key: number): void {
    this._native.keyboard_press(key);
  }

  release(key: number): void {
    this._native.keyboard_release(key);
  }

  clone(): Keyboard {
    const copy = new Keyboard();
    copy.autoDelay = this.autoDelay.clone();
    return copy;
  }

  static compile(keys: string): Array<{ down: boolean; key: number }> {
    const { getNativeBackend } = require("./native");
    return getNativeBackend().keyboard_compile(keys);
  }

  static getState(keycode?: number): Record<number, boolean> | boolean {
    const { getNativeBackend } = require("./native");
    const native = getNativeBackend();
    if (keycode !== undefined) {
      return native.keyboard_getKeyState(keycode);
    }
    return native.keyboard_getState();
  }
}
