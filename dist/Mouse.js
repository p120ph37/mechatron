"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mouse = void 0;
const Range_1 = require("./Range");
const Point_1 = require("./Point");
const Timer_1 = require("./Timer");
const constants_1 = require("./constants");
const ALL_BUTTONS = [constants_1.BUTTON_LEFT, constants_1.BUTTON_MID, constants_1.BUTTON_RIGHT, constants_1.BUTTON_X1, constants_1.BUTTON_X2];
class Mouse {
    autoDelay;
    _native;
    constructor(a) {
        const { getNativeBackend } = require("./native");
        this._native = getNativeBackend();
        if (a instanceof Mouse) {
            this.autoDelay = a.autoDelay.clone();
        }
        else {
            this.autoDelay = new Range_1.Range(40, 90);
        }
    }
    click(button) {
        this._native.mouse_press(button);
        Timer_1.Timer.sleep(this.autoDelay);
        this._native.mouse_release(button);
        Timer_1.Timer.sleep(this.autoDelay);
    }
    press(button) {
        this._native.mouse_press(button);
        Timer_1.Timer.sleep(this.autoDelay);
    }
    release(button) {
        this._native.mouse_release(button);
        Timer_1.Timer.sleep(this.autoDelay);
    }
    scrollH(amount) {
        this._native.mouse_scrollH(amount);
        Timer_1.Timer.sleep(this.autoDelay);
    }
    scrollV(amount) {
        this._native.mouse_scrollV(amount);
        Timer_1.Timer.sleep(this.autoDelay);
    }
    clone() {
        const copy = new Mouse();
        copy.autoDelay = this.autoDelay.clone();
        return copy;
    }
    static getPos() {
        const { getNativeBackend } = require("./native");
        const p = getNativeBackend().mouse_getPos();
        return new Point_1.Point(p.x, p.y);
    }
    static setPos(p, y) {
        const { getNativeBackend } = require("./native");
        const pt = Point_1.Point._resolve(p, y);
        getNativeBackend().mouse_setPos(pt.x, pt.y);
    }
    static getState(button) {
        const { getNativeBackend } = require("./native");
        const native = getNativeBackend();
        if (button !== undefined) {
            return native.mouse_getButtonState(button);
        }
        const state = {};
        for (const btn of ALL_BUTTONS) {
            state[btn] = native.mouse_getButtonState(btn);
        }
        return state;
    }
}
exports.Mouse = Mouse;
