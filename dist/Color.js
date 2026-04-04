"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Color = void 0;
class Color {
    a;
    r;
    g;
    b;
    constructor(a, g, b, alpha) {
        if (a === undefined) {
            this.a = 0;
            this.r = 0;
            this.g = 0;
            this.b = 0;
        }
        else if (a instanceof Color) {
            this.a = a.a;
            this.r = a.r;
            this.g = a.g;
            this.b = a.b;
        }
        else if (typeof a === "object") {
            this.r = a.r;
            this.g = a.g;
            this.b = a.b;
            this.a = a.a !== undefined ? a.a : 255;
        }
        else if (g !== undefined) {
            this.r = a;
            this.g = g;
            this.b = b;
            this.a = alpha !== undefined ? alpha : 255;
        }
        else {
            // Single number = ARGB
            this.a = ((a & 0xFF000000) >>> 24);
            this.r = ((a & 0x00FF0000) >>> 16);
            this.g = ((a & 0x0000FF00) >>> 8);
            this.b = ((a & 0x000000FF) >>> 0);
        }
    }
    getARGB() {
        return ((this.a << 24) | (this.r << 16) | (this.g << 8) | this.b) >>> 0;
    }
    setARGB(argb) {
        if (typeof argb !== "number")
            throw new TypeError("Invalid arguments");
        this.a = ((argb & 0xFF000000) >>> 24);
        this.r = ((argb & 0x00FF0000) >>> 16);
        this.g = ((argb & 0x0000FF00) >>> 8);
        this.b = ((argb & 0x000000FF) >>> 0);
    }
    eq(...args) {
        if (args.length === 0)
            return false;
        const c = Color._resolve(args);
        return this.a === c.a && this.r === c.r && this.g === c.g && this.b === c.b;
    }
    ne(...args) {
        if (args.length === 0)
            return true;
        return !this.eq(...args);
    }
    clone() { return new Color(this); }
    toString() {
        return `[${this.r}, ${this.g}, ${this.b}, ${this.a}]`;
    }
    static normalize(...args) {
        if (args.length === 0)
            return { r: 0, g: 0, b: 0, a: 0 };
        const c = Color._resolve(args);
        return { r: c.r, g: c.g, b: c.b, a: c.a };
    }
    /** @internal */
    static _resolve(args) {
        const a0 = args[0];
        if (a0 instanceof Color)
            return { a: a0.a, r: a0.r, g: a0.g, b: a0.b };
        if (typeof a0 === "object" && a0 !== null && "r" in a0 && "g" in a0 && "b" in a0) {
            return { r: a0.r, g: a0.g, b: a0.b, a: a0.a !== undefined ? a0.a : 255 };
        }
        if (typeof a0 === "number" && args.length >= 3) {
            return { r: a0, g: args[1], b: args[2], a: args[3] !== undefined ? args[3] : 255 };
        }
        if (typeof a0 === "number" && args.length === 1) {
            return {
                a: ((a0 & 0xFF000000) >>> 24),
                r: ((a0 & 0x00FF0000) >>> 16),
                g: ((a0 & 0x0000FF00) >>> 8),
                b: ((a0 & 0x000000FF) >>> 0),
            };
        }
        throw new TypeError("Invalid arguments");
    }
}
exports.Color = Color;
