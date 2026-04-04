"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Module = exports.Segment = void 0;
const Process_1 = require("./Process");
class Segment {
    valid = false;
    base = 0;
    size = 0;
    name = "";
    constructor() {
        // Allow calling without new
        if (!(this instanceof Segment)) {
            return new Segment();
        }
    }
    contains(value) {
        if (typeof value !== "number")
            throw new TypeError("Invalid arguments");
        const base = this.base;
        const stop = this.base + this.size;
        return base <= value && stop > value;
    }
    lt(value) {
        if (value instanceof Segment)
            return this.base < value.base;
        if (typeof value === "number")
            return this.base < value;
        throw new TypeError("Invalid arguments");
    }
    gt(value) {
        if (value instanceof Segment)
            return this.base > value.base;
        if (typeof value === "number")
            return this.base > value;
        throw new TypeError("Invalid arguments");
    }
    le(value) {
        if (value instanceof Segment)
            return this.base <= value.base;
        if (typeof value === "number")
            return this.base <= value;
        throw new TypeError("Invalid arguments");
    }
    ge(value) {
        if (value instanceof Segment)
            return this.base >= value.base;
        if (typeof value === "number")
            return this.base >= value;
        throw new TypeError("Invalid arguments");
    }
    eq(segment) {
        if (!(segment instanceof Segment))
            throw new TypeError("Invalid arguments");
        return this.valid === segment.valid
            && this.base === segment.base
            && this.size === segment.size
            && this.name === segment.name;
    }
    ne(segment) {
        if (!(segment instanceof Segment))
            throw new TypeError("Invalid arguments");
        return this.valid !== segment.valid
            || this.base !== segment.base
            || this.size !== segment.size
            || this.name !== segment.name;
    }
    clone() {
        const copy = new Segment();
        copy.valid = this.valid;
        copy.base = this.base;
        copy.size = this.size;
        copy.name = this.name;
        return copy;
    }
    static compare(a, b) {
        if (a.lt(b))
            return -1;
        if (a.gt(b))
            return 1;
        return 0;
    }
}
exports.Segment = Segment;
class Module {
    valid;
    name;
    path;
    base;
    size;
    process;
    _segments = null;
    _proc = null;
    constructor(a, b, c, d, e) {
        if (a instanceof Module) {
            this.valid = a.valid;
            this.name = a.name;
            this.path = a.path;
            this.base = a.base;
            this.size = a.size;
            this.process = a.process;
        }
        else if (a instanceof Process_1.Process && typeof b === "string") {
            // Module(process, name, path, base, size)
            this.valid = true;
            this.name = b;
            this.path = c || "";
            this.base = d || 0;
            this.size = e || 0;
            this.process = a;
        }
        else if (a && typeof a === "object" && "pid" in a) {
            this.valid = a.valid;
            this.name = a.name;
            this.path = a.path;
            this.base = a.base;
            this.size = a.size;
            this.process = new Process_1.Process(a.pid);
        }
        else {
            this.valid = false;
            this.name = "";
            this.path = "";
            this.base = 0;
            this.size = 0;
            this.process = new Process_1.Process();
        }
    }
    // Getter methods (matching original C++ adapter API)
    isValid() { return this.valid; }
    getName() { return this.name; }
    getPath() { return this.path; }
    getBase() { return this.base; }
    getSize() { return this.size; }
    getProcess() { return this.process; }
    contains(address) {
        return address >= this.base && address < this.base + this.size;
    }
    lt(value) {
        if (value instanceof Module)
            return this.base < value.base;
        if (typeof value === "number")
            return this.base < value;
        throw new TypeError("Invalid arguments");
    }
    gt(value) {
        if (value instanceof Module)
            return this.base > value.base;
        if (typeof value === "number")
            return this.base > value;
        throw new TypeError("Invalid arguments");
    }
    le(value) {
        if (value instanceof Module)
            return this.base <= value.base;
        if (typeof value === "number")
            return this.base <= value;
        throw new TypeError("Invalid arguments");
    }
    ge(value) {
        if (value instanceof Module)
            return this.base >= value.base;
        if (typeof value === "number")
            return this.base >= value;
        throw new TypeError("Invalid arguments");
    }
    eq(value) {
        if (value instanceof Module)
            return this.base === value.base;
        if (typeof value === "number")
            return this.base === value;
        throw new TypeError("Invalid arguments");
    }
    ne(value) {
        if (value instanceof Module)
            return this.base !== value.base;
        if (typeof value === "number")
            return this.base !== value;
        throw new TypeError("Invalid arguments");
    }
    getSegments() {
        if (!this.valid)
            return [];
        if (this._segments === null) {
            const proc = this._proc || this.process;
            const rawSegs = Process_1.Process._getSegments(proc, this.base);
            this._segments = rawSegs.map((s) => {
                const seg = new Segment();
                seg.valid = s.valid;
                seg.base = s.base;
                seg.size = s.size;
                seg.name = s.name;
                return seg;
            });
        }
        return this._segments;
    }
    clone() {
        const copy = new Module(this);
        if (this._segments !== null && this._segments !== undefined) {
            copy._segments = this._segments.map((s) => s.clone());
        }
        else {
            copy._segments = null;
        }
        return copy;
    }
    static compare(a, b) {
        if (a.lt(b))
            return -1;
        if (a.gt(b))
            return 1;
        return 0;
    }
}
exports.Module = Module;
