"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bounds = void 0;
const Point_1 = require("./Point");
const Size_1 = require("./Size");
class Bounds {
    x;
    y;
    w;
    h;
    constructor(a, b, c, d) {
        if (a === undefined) {
            this.x = 0;
            this.y = 0;
            this.w = 0;
            this.h = 0;
        }
        else if (a instanceof Bounds) {
            this.x = a.x;
            this.y = a.y;
            this.w = a.w;
            this.h = a.h;
        }
        else if (a instanceof Point_1.Point && (b instanceof Size_1.Size || (typeof b === "object" && b !== null && "w" in b))) {
            this.x = a.x;
            this.y = a.y;
            const s = b;
            this.w = s.w;
            this.h = s.h;
        }
        else if (typeof a === "object" && "x" in a && "w" in a) {
            this.x = a.x;
            this.y = a.y;
            this.w = a.w;
            this.h = a.h;
        }
        else if (typeof a === "object" && "l" in a) {
            const o = a;
            this.x = o.l;
            this.y = o.t;
            this.w = o.r - o.l;
            this.h = o.b - o.t;
        }
        else if (typeof a === "object" && "x" in a && typeof b === "object" && b !== null) {
            // Point-like + Size-like as plain objects
            const p = a;
            const s = b;
            this.x = p.x;
            this.y = p.y;
            this.w = s.w;
            this.h = s.h;
        }
        else if (typeof a === "number" && c !== undefined) {
            this.x = a;
            this.y = b;
            this.w = c;
            this.h = d;
        }
        else if (typeof a === "number" && b !== undefined) {
            this.x = a;
            this.y = a;
            this.w = b;
            this.h = b;
        }
        else {
            const v = a;
            this.x = v;
            this.y = v;
            this.w = v;
            this.h = v;
        }
    }
    isZero() { return this.x === 0 && this.y === 0 && this.w === 0 && this.h === 0; }
    isEmpty() { return this.w === 0 || this.h === 0; }
    isValid() { return this.w > 0 && this.h > 0; }
    getLeft() { return this.x; }
    getTop() { return this.y; }
    getRight() { return this.x + this.w; }
    getBottom() { return this.y + this.h; }
    setLeft(l) { if (typeof l !== "number")
        throw new TypeError("Invalid arguments"); this.x = l; }
    setTop(t) { if (typeof t !== "number")
        throw new TypeError("Invalid arguments"); this.y = t; }
    setRight(r) { if (typeof r !== "number")
        throw new TypeError("Invalid arguments"); this.w = r - this.x; }
    setBottom(b) { if (typeof b !== "number")
        throw new TypeError("Invalid arguments"); this.h = b - this.y; }
    getLTRB() {
        return { l: this.x, t: this.y, r: this.x + this.w, b: this.y + this.h };
    }
    setLTRB(l, t, r, b) {
        if (typeof l !== "number" || typeof t !== "number" || typeof r !== "number" || typeof b !== "number") {
            throw new TypeError("Invalid arguments");
        }
        this.x = l;
        this.y = t;
        this.w = r - l;
        this.h = b - t;
    }
    normalize() {
        if (this.w < 0) {
            this.x += this.w;
            this.w = -this.w;
        }
        if (this.h < 0) {
            this.y += this.h;
            this.h = -this.h;
        }
    }
    static _norm(x, y, w, h) {
        let l = x, r = x, t = y, b = y;
        if (w < 0)
            l += w;
        else
            r += w;
        if (h < 0)
            t += h;
        else
            b += h;
        return { l, r, t, b };
    }
    containsP(...args) {
        const inc = typeof args[args.length - 1] === "boolean" ? args.pop() : true;
        if (args.length > 0 && typeof args[0] !== "number" && !(typeof args[0] === "object" && args[0] !== null && "x" in args[0] && "y" in args[0]) && !(args[0] instanceof Point_1.Point)) {
            throw new TypeError("Invalid arguments");
        }
        const p = Point_1.Point._resolve(args[0], args[1]);
        const { l, r, t, b } = Bounds._norm(this.x, this.y, this.w, this.h);
        return inc
            ? l <= p.x && p.x <= r && t <= p.y && p.y <= b
            : l < p.x && p.x < r && t < p.y && p.y < b;
    }
    containsB(...args) {
        const inc = typeof args[args.length - 1] === "boolean" ? args.pop() : true;
        Bounds._validateArgs(args);
        const o = Bounds._resolveArgs(args);
        if ((this.w === 0 && this.h === 0) || (o.w === 0 && o.h === 0))
            return false;
        const n1 = Bounds._norm(this.x, this.y, this.w, this.h);
        const n2 = Bounds._norm(o.x, o.y, o.w, o.h);
        return inc
            ? n1.l <= n2.l && n1.r >= n2.r && n1.t <= n2.t && n1.b >= n2.b
            : n1.l < n2.l && n1.r > n2.r && n1.t < n2.t && n1.b > n2.b;
    }
    intersects(...args) {
        const inc = typeof args[args.length - 1] === "boolean" ? args.pop() : true;
        Bounds._validateArgs(args);
        const o = Bounds._resolveArgs(args);
        if ((this.w === 0 && this.h === 0) || (o.w === 0 && o.h === 0))
            return false;
        const n1 = Bounds._norm(this.x, this.y, this.w, this.h);
        const n2 = Bounds._norm(o.x, o.y, o.w, o.h);
        return inc
            ? n1.l <= n2.r && n1.r >= n2.l && n1.t <= n2.b && n1.b >= n2.t
            : n1.l < n2.r && n1.r > n2.l && n1.t < n2.b && n1.b > n2.t;
    }
    getPoint() { return new Point_1.Point(this.x, this.y); }
    setPoint(p, y) {
        if (p !== undefined && typeof p !== "number" && !(typeof p === "object" && p !== null && "x" in p && "y" in p)) {
            throw new TypeError("Invalid arguments");
        }
        const pt = Point_1.Point._resolve(p, y);
        this.x = pt.x;
        this.y = pt.y;
    }
    getSize() { return new Size_1.Size(this.w, this.h); }
    setSize(s, h) {
        if (s !== undefined && typeof s !== "number" && !(typeof s === "object" && s !== null && "w" in s && "h" in s)) {
            throw new TypeError("Invalid arguments");
        }
        const sz = Size_1.Size._resolve(s, h);
        this.w = sz.w;
        this.h = sz.h;
    }
    getCenter() {
        return new Point_1.Point(this.x + Math.trunc(this.w * 0.5), this.y + Math.trunc(this.h * 0.5));
    }
    unite(...args) {
        Bounds._validateArgs(args);
        const o = Bounds._resolveArgs(args);
        const n1 = Bounds._norm(this.x, this.y, this.w, this.h);
        const n2 = Bounds._norm(o.x, o.y, o.w, o.h);
        const result = new Bounds();
        if (this.w === 0 && this.h === 0) {
            result.setLTRB(n2.l, n2.t, n2.r, n2.b);
            return result;
        }
        if (o.w === 0 && o.h === 0) {
            result.setLTRB(n1.l, n1.t, n1.r, n1.b);
            return result;
        }
        result.setLTRB(Math.min(n1.l, n2.l), Math.min(n1.t, n2.t), Math.max(n1.r, n2.r), Math.max(n1.b, n2.b));
        return result;
    }
    intersect(...args) {
        Bounds._validateArgs(args);
        const o = Bounds._resolveArgs(args);
        if ((this.w === 0 && this.h === 0) || (o.w === 0 && o.h === 0))
            return new Bounds();
        const n1 = Bounds._norm(this.x, this.y, this.w, this.h);
        const n2 = Bounds._norm(o.x, o.y, o.w, o.h);
        if (n1.l > n2.r || n1.r < n2.l || n1.t > n2.b || n1.b < n2.t)
            return new Bounds();
        const result = new Bounds();
        result.setLTRB(Math.max(n1.l, n2.l), Math.max(n1.t, n2.t), Math.min(n1.r, n2.r), Math.min(n1.b, n2.b));
        return result;
    }
    eq(...args) {
        if (args.length === 0)
            return false;
        Bounds._validateArgs(args);
        const o = Bounds._resolveArgs(args);
        return this.x === o.x && this.y === o.y && this.w === o.w && this.h === o.h;
    }
    ne(...args) {
        if (args.length === 0)
            return true;
        Bounds._validateArgs(args);
        return !this.eq(...args);
    }
    clone() { return new Bounds(this); }
    toString() { return `[${this.x}, ${this.y}, ${this.w}, ${this.h}]`; }
    static normalize(...args) {
        const b = Bounds._resolveArgs(args);
        return { x: b.x, y: b.y, w: b.w, h: b.h };
    }
    /** @internal */
    static _validateArgs(args) {
        if (args.length === 0)
            return; // no args = use defaults
        const a0 = args[0];
        if (a0 === undefined)
            return; // explicit undefined = use defaults
        if (typeof a0 === "string")
            throw new TypeError("Invalid arguments");
        if (a0 instanceof Bounds)
            return;
        if (typeof a0 === "number") {
            if (args.length >= 4)
                return; // (x, y, w, h)
            if (args.length >= 2)
                return; // (val, val) - dubious but allowed
            return; // single number
        }
        if (typeof a0 === "object" && a0 !== null) {
            // {x, y, w, h} - must have all four
            if ("w" in a0 && "h" in a0 && "x" in a0 && "y" in a0)
                return;
            // {l, t, r, b} - must have all four
            if ("l" in a0 && "t" in a0 && "r" in a0 && "b" in a0)
                return;
            // (Point/obj, Size/obj) pair
            if ("x" in a0 && "y" in a0 && args.length >= 2) {
                const a1 = args[1];
                if (typeof a1 === "object" && a1 !== null && "w" in a1 && "h" in a1)
                    return;
            }
            throw new TypeError("Invalid arguments");
        }
        throw new TypeError("Invalid arguments");
    }
    /** @internal */
    static _resolveArgs(args) {
        const a0 = args[0];
        if (a0 instanceof Bounds)
            return { x: a0.x, y: a0.y, w: a0.w, h: a0.h };
        // {x, y, w, h} object
        if (typeof a0 === "object" && a0 !== null && "x" in a0 && "w" in a0) {
            return { x: a0.x, y: a0.y, w: a0.w, h: a0.h };
        }
        // {l, t, r, b} object
        if (typeof a0 === "object" && a0 !== null && "l" in a0) {
            return { x: a0.l, y: a0.t, w: a0.r - a0.l, h: a0.b - a0.t };
        }
        // (Point/obj, Size/obj)
        if (typeof a0 === "object" && a0 !== null && "x" in a0 && "y" in a0 && args.length >= 2) {
            const a1 = args[1];
            if (typeof a1 === "object" && a1 !== null && "w" in a1 && "h" in a1) {
                return { x: a0.x, y: a0.y, w: a1.w, h: a1.h };
            }
        }
        // (x, y, w, h)
        if (typeof a0 === "number" && args.length >= 4) {
            return { x: a0, y: args[1], w: args[2], h: args[3] };
        }
        if (typeof a0 === "number")
            return { x: a0, y: a0, w: a0, h: a0 };
        return { x: 0, y: 0, w: 0, h: 0 };
    }
}
exports.Bounds = Bounds;
