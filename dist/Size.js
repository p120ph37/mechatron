"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Size = void 0;
const Point_1 = require("./Point");
class Size {
    w;
    h;
    constructor(a, b) {
        if (a === undefined) {
            this.w = 0;
            this.h = 0;
        }
        else if (a instanceof Size) {
            this.w = a.w;
            this.h = a.h;
        }
        else if (typeof a === "object") {
            this.w = a.w;
            this.h = a.h;
        }
        else if (b !== undefined) {
            this.w = a;
            this.h = b;
        }
        else {
            this.w = a;
            this.h = a;
        }
    }
    isZero() { return this.w === 0 && this.h === 0; }
    isEmpty() { return this.w === 0 || this.h === 0; }
    toPoint() { return new Point_1.Point(this.w, this.h); }
    add(other, b) {
        const s = Size._resolve(other, b);
        return new Size(this.w + s.w, this.h + s.h);
    }
    sub(other, b) {
        const s = Size._resolve(other, b);
        return new Size(this.w - s.w, this.h - s.h);
    }
    eq(...args) {
        if (args.length === 0)
            return false;
        const a0 = args[0];
        if (a0 instanceof Size)
            return this.w === a0.w && this.h === a0.h;
        if (typeof a0 === "object" && a0 !== null && "w" in a0 && "h" in a0) {
            return this.w === a0.w && this.h === a0.h;
        }
        if (typeof a0 === "number" && args.length >= 2)
            return this.w === a0 && this.h === args[1];
        if (typeof a0 === "number")
            return this.w === a0 && this.h === a0;
        throw new TypeError("Invalid arguments");
    }
    ne(...args) {
        if (args.length === 0)
            return true;
        return !this.eq(...args);
    }
    clone() { return new Size(this); }
    toString() { return `[${this.w}, ${this.h}]`; }
    static normalize(a, b) {
        if (a instanceof Size)
            return { w: a.w, h: a.h };
        if (typeof a === "object" && a !== null && a !== undefined)
            return { w: a.w, h: a.h };
        if (b !== undefined)
            return { w: a, h: b };
        if (typeof a === "number")
            return { w: a, h: a };
        return { w: 0, h: 0 };
    }
    /** @internal */
    static _resolve(a, b) {
        if (a instanceof Size)
            return a;
        if (typeof a === "object" && a !== null && a !== undefined)
            return a;
        if (b !== undefined)
            return { w: a, h: b };
        if (typeof a === "number")
            return { w: a, h: a };
        return { w: 0, h: 0 };
    }
}
exports.Size = Size;
