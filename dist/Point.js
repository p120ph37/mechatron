"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Point = void 0;
const Size_1 = require("./Size");
class Point {
    x;
    y;
    constructor(a, b) {
        if (a === undefined) {
            this.x = 0;
            this.y = 0;
        }
        else if (a instanceof Point) {
            this.x = a.x;
            this.y = a.y;
        }
        else if (typeof a === "object") {
            this.x = a.x;
            this.y = a.y;
        }
        else if (b !== undefined) {
            this.x = a;
            this.y = b;
        }
        else {
            this.x = a;
            this.y = a;
        }
    }
    isZero() { return this.x === 0 && this.y === 0; }
    toSize() { return new Size_1.Size(this.x, this.y); }
    add(other, b) {
        const p = Point._resolve(other, b);
        return new Point(this.x + p.x, this.y + p.y);
    }
    sub(other, b) {
        const p = Point._resolve(other, b);
        return new Point(this.x - p.x, this.y - p.y);
    }
    neg() { return new Point(-this.x, -this.y); }
    eq(...args) {
        if (args.length === 0)
            return false;
        const a0 = args[0];
        if (a0 instanceof Point)
            return this.x === a0.x && this.y === a0.y;
        if (typeof a0 === "object" && a0 !== null && "x" in a0 && "y" in a0) {
            return this.x === a0.x && this.y === a0.y;
        }
        if (typeof a0 === "number" && args.length >= 2)
            return this.x === a0 && this.y === args[1];
        if (typeof a0 === "number")
            return this.x === a0 && this.y === a0;
        throw new TypeError("Invalid arguments");
    }
    ne(...args) {
        if (args.length === 0)
            return true;
        return !this.eq(...args);
    }
    clone() { return new Point(this); }
    toString() { return `[${this.x}, ${this.y}]`; }
    static normalize(a, b) {
        if (a instanceof Point)
            return { x: a.x, y: a.y };
        if (typeof a === "object" && a !== null && a !== undefined)
            return { x: a.x, y: a.y };
        if (b !== undefined)
            return { x: a, y: b };
        if (typeof a === "number")
            return { x: a, y: a };
        return { x: 0, y: 0 };
    }
    /** @internal */
    static _resolve(a, b) {
        if (a instanceof Point)
            return a;
        if (typeof a === "object" && a !== null && a !== undefined)
            return a;
        if (b !== undefined)
            return { x: a, y: b };
        if (typeof a === "number")
            return { x: a, y: a };
        return { x: 0, y: 0 };
    }
}
exports.Point = Point;
