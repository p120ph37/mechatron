import { Range } from "./Range";
import { Timer } from "./Timer";
import type { NativeBackend } from "./native";
import { getKeyNames, getAllKeys } from "./constants";

// --- keyboard_compile implementation (moved from Rust) ---
// Parses key sequence strings like "^a" (ctrl+a), "{ENTER}", "+{TAB 3}"
// into an array of {down, key} pairs using platform-specific key constants.

function resolveKeyName(name: string): number | undefined {
  const names = getKeyNames();
  // Direct lookup (already uppercased by caller)
  if (names[name] !== undefined) return names[name];
  // Single character -> letter key
  if (name.length === 1) {
    const upper = name.toUpperCase();
    return names[upper];
  }
  return undefined;
}

function compileKeys(keys: string): Array<{ down: boolean; key: number }> | null {
  const result: Array<{ down: boolean; key: number }> = [];
  const modkeys: number[] = [-1, -1, -1, -1]; // alt, control, shift, system
  let group = 0;

  const modKeyNames = ["ALT", "CONTROL", "SHIFT", "SYSTEM"];

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
        const key = resolveKeyName(token);
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
      case '%': {
        if (modkeys[0] !== -1) return null;
        const altKey = resolveKeyName("ALT");
        if (altKey !== undefined) { result.push({ down: true, key: altKey }); modkeys[0] = 0; }
        break;
      }
      case '^': {
        if (modkeys[1] !== -1) return null;
        const ctrlKey = resolveKeyName("CONTROL");
        if (ctrlKey !== undefined) { result.push({ down: true, key: ctrlKey }); modkeys[1] = 0; }
        break;
      }
      case '+': {
        if (modkeys[2] !== -1) return null;
        const shiftKey = resolveKeyName("SHIFT");
        if (shiftKey !== undefined) { result.push({ down: true, key: shiftKey }); modkeys[2] = 0; }
        break;
      }
      case '$': {
        if (modkeys[3] !== -1) return null;
        const sysKey = resolveKeyName("SYSTEM");
        if (sysKey !== undefined) { result.push({ down: true, key: sysKey }); modkeys[3] = 0; }
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
        const upper = ch.toUpperCase();
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

// --- Keyboard class ---

export class Keyboard {
  autoDelay: Range;
  private _native: NativeBackend;

  constructor();
  constructor(other: Keyboard);
  constructor(a?: Keyboard) {
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
    const { getNativeBackend } = require("./native");
    const native = getNativeBackend();
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
