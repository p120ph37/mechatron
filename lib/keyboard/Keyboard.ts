import { Range } from "../types";
import { Timer } from "../types";
import { getNative } from "../napi";
import { getKeyNames, getAllKeys } from "./constants";

function resolveKeyName(name: Uppercase<string>): number | undefined {
  return getKeyNames()[name];
}

function compileKeys(keys: string): Array<{ down: boolean; key: number }> | null {
  const result: Array<{ down: boolean; key: number }> = [];
  const modChars: Record<string, number> = { '%': 0, '^': 1, '+': 2, '$': 3 };
  const modKeyNames: Uppercase<string>[] = ["ALT", "CONTROL", "SHIFT", "SYSTEM"];
  const modkeys: number[] = [-1, -1, -1, -1];
  let group = 0;

  function cancelMods(g: number) {
    for (let i = 0; i < 4; i++) {
      if (modkeys[i] === g) {
        const keycode = resolveKeyName(modKeyNames[i]);
        if (keycode !== undefined) result.push({ down: false, key: keycode });
        modkeys[i] = -1;
      }
    }
  }

  let i = 0;
  while (i < keys.length) {
    const ch = keys[i];
    switch (ch) {
      case '}':
        return null;
      case '{': {
        i++;
        let token = "";
        let countStr = "";
        let inCount = false;
        while (true) {
          if (i >= keys.length) return null;
          if (inCount) {
            if (countStr.length >= 4) return null;
            if (keys[i] === '}') break;
            countStr += keys[i];
          } else {
            if (token.length >= 16) return null;
            if (keys[i] === '}') break;
            if (keys[i] === ' ') {
              inCount = true;
              i++;
              continue;
            }
            token += keys[i].toUpperCase();
          }
          i++;
        }
        const key = resolveKeyName(token as Uppercase<string>);
        if (key === undefined) return null;
        let keyCount = 1;
        if (inCount) {
          const parsed = parseInt(countStr, 10);
          if (isNaN(parsed) || parsed < 0 || parsed > 99) return null;
          keyCount = parsed;
        }
        for (let j = 0; j < keyCount; j++) {
          result.push({ down: true, key });
          result.push({ down: false, key });
        }
        cancelMods(0);
        break;
      }
      case '%': case '^': case '+': case '$': {
        const mi = modChars[ch];
        if (modkeys[mi] !== -1) return null;
        const mk = resolveKeyName(modKeyNames[mi]);
        if (mk !== undefined) { result.push({ down: true, key: mk }); modkeys[mi] = 0; }
        break;
      }
      case '(': {
        group++;
        if (group > 4) return null;
        for (let j = 0; j < 4; j++) {
          if (modkeys[j] === 0) modkeys[j] = group;
        }
        break;
      }
      case ')': {
        if (group < 1) return null;
        cancelMods(group);
        group--;
        break;
      }
      case '\t': case '\n': case '\x0b': case '\x0c': case '\r':
        break;
      default: {
        const upper = ch.toUpperCase() as Uppercase<string>;
        const key = resolveKeyName(upper);
        if (key === undefined) return null;
        result.push({ down: true, key });
        result.push({ down: false, key });
        cancelMods(0);
        break;
      }
    }
    i++;
  }
  if (group !== 0) return null;
  return result;
}

export class Keyboard {
  autoDelay: Range;
  private _native: any;

  constructor();
  constructor(other: Keyboard);
  constructor(a?: Keyboard) {
    this._native = getNative("keyboard");
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
    this._native.keyboard_press(key);
    Timer.sleep(this.autoDelay);
    this._native.keyboard_release(key);
    Timer.sleep(this.autoDelay);
  }

  press(key: number): void {
    this._native.keyboard_press(key);
    Timer.sleep(this.autoDelay);
  }

  release(key: number): void {
    this._native.keyboard_release(key);
    Timer.sleep(this.autoDelay);
  }

  clone(): Keyboard {
    const copy = new Keyboard();
    copy.autoDelay = this.autoDelay.clone();
    return copy;
  }

  static compile(keys: string): Array<{ down: boolean; key: number }> {
    return compileKeys(keys) || [];
  }

  static getState(keycode?: number): Record<number, boolean> | boolean {
    const native = getNative("keyboard");
    if (keycode !== undefined) {
      return native.keyboard_getKeyState(keycode);
    }
    const state: Record<number, boolean> = {};
    for (const key of getAllKeys()) {
      state[key] = native.keyboard_getKeyState(key);
    }
    return state;
  }
}
