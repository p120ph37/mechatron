"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Keyboard = void 0;
const Range_1 = require("./Range");
const Timer_1 = require("./Timer");
const constants_1 = require("./constants");
function resolveKeyName(name) {
    const names = (0, constants_1.getKeyNames)();
    // Direct lookup (already uppercased by caller)
    if (names[name] !== undefined)
        return names[name];
    // Single character -> letter key
    if (name.length === 1) {
        const upper = name.toUpperCase();
        return names[upper];
    }
    return undefined;
}
function compileKeys(keys) {
    const result = [];
    const modChars = { '%': 0, '^': 1, '+': 2, '$': 3 };
    const modKeyNames = ["ALT", "CONTROL", "SHIFT", "SYSTEM"];
    const modkeys = [-1, -1, -1, -1];
    let group = 0;
    function cancelMods(g) {
        for (let i = 0; i < 4; i++) {
            if (modkeys[i] === g) {
                const keycode = resolveKeyName(modKeyNames[i]);
                if (keycode !== undefined)
                    result.push({ down: false, key: keycode });
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
                    if (i >= keys.length)
                        return null;
                    if (inCount) {
                        if (countStr.length >= 4)
                            return null;
                        if (keys[i] === '}')
                            break;
                        countStr += keys[i];
                    }
                    else {
                        if (token.length >= 16)
                            return null;
                        if (keys[i] === '}')
                            break;
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
                if (key === undefined)
                    return null;
                let keyCount = 1;
                if (inCount) {
                    const parsed = parseInt(countStr, 10);
                    if (isNaN(parsed) || parsed < 0 || parsed > 99)
                        return null;
                    keyCount = parsed;
                }
                for (let j = 0; j < keyCount; j++) {
                    result.push({ down: true, key });
                    result.push({ down: false, key });
                }
                cancelMods(0);
                break;
            }
            case '%':
            case '^':
            case '+':
            case '$': {
                const mi = modChars[ch];
                if (modkeys[mi] !== -1)
                    return null;
                const mk = resolveKeyName(modKeyNames[mi]);
                if (mk !== undefined) {
                    result.push({ down: true, key: mk });
                    modkeys[mi] = 0;
                }
                break;
            }
            case '(': {
                group++;
                if (group > 4)
                    return null;
                for (let j = 0; j < 4; j++) {
                    if (modkeys[j] === 0)
                        modkeys[j] = group;
                }
                break;
            }
            case ')': {
                if (group < 1)
                    return null;
                cancelMods(group);
                group--;
                break;
            }
            case '\t':
            case '\n':
            case '\x0b':
            case '\x0c':
            case '\r':
                break;
            default: {
                const upper = ch.toUpperCase();
                const key = resolveKeyName(upper);
                if (key === undefined)
                    return null;
                result.push({ down: true, key });
                result.push({ down: false, key });
                cancelMods(0);
                break;
            }
        }
        i++;
    }
    if (group !== 0)
        return null;
    return result;
}
class Keyboard {
    autoDelay;
    _native;
    constructor(a) {
        const { getNativeBackend } = require("./native");
        this._native = getNativeBackend();
        if (a instanceof Keyboard) {
            this.autoDelay = a.autoDelay.clone();
        }
        else {
            this.autoDelay = new Range_1.Range(40, 90);
        }
    }
    click(key) {
        if (typeof key === "string") {
            const compiled = Keyboard.compile(key);
            for (const entry of compiled) {
                if (entry.down) {
                    this._native.keyboard_press(entry.key);
                }
                else {
                    this._native.keyboard_release(entry.key);
                }
                Timer_1.Timer.sleep(this.autoDelay);
            }
            return;
        }
        this._native.keyboard_press(key);
        Timer_1.Timer.sleep(this.autoDelay);
        this._native.keyboard_release(key);
        Timer_1.Timer.sleep(this.autoDelay);
    }
    press(key) {
        this._native.keyboard_press(key);
        Timer_1.Timer.sleep(this.autoDelay);
    }
    release(key) {
        this._native.keyboard_release(key);
        Timer_1.Timer.sleep(this.autoDelay);
    }
    clone() {
        const copy = new Keyboard();
        copy.autoDelay = this.autoDelay.clone();
        return copy;
    }
    static compile(keys) {
        return compileKeys(keys) || [];
    }
    static getState(keycode) {
        const { getNativeBackend } = require("./native");
        const native = getNativeBackend();
        if (keycode !== undefined) {
            return native.keyboard_getKeyState(keycode);
        }
        const state = {};
        for (const key of (0, constants_1.getAllKeys)()) {
            state[key] = native.keyboard_getKeyState(key);
        }
        return state;
    }
}
exports.Keyboard = Keyboard;
