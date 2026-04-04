"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timer = void 0;
const Range_1 = require("./Range");
const INVALID = -1;
function getCpuTimeMs() {
    // performance.now() returns milliseconds with sub-ms precision in both Node and Bun
    return Math.floor(performance.now());
}
function sleepSync(ms) {
    if (ms <= 0)
        return;
    // Atomics.wait provides synchronous sleep in both Node and Bun
    const buf = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(buf, 0, 0, ms);
}
class Timer {
    _started = INVALID;
    constructor(a) {
        if (a instanceof Timer) {
            this._started = a._started;
        }
    }
    start() {
        this._started = getCpuTimeMs();
    }
    reset() {
        if (this._started === INVALID)
            return 0;
        const old = this._started;
        this._started = INVALID;
        return getCpuTimeMs() - old;
    }
    restart() {
        if (this._started === INVALID) {
            this._started = getCpuTimeMs();
            return 0;
        }
        const old = this._started;
        this._started = getCpuTimeMs();
        return this._started - old;
    }
    getElapsed() {
        if (this._started === INVALID)
            return 0;
        return getCpuTimeMs() - this._started;
    }
    hasStarted() {
        return this._started !== INVALID;
    }
    hasExpired(time) {
        if (time === undefined || typeof time !== "number")
            throw new TypeError("Invalid arguments");
        if (this._started === INVALID)
            return true;
        return this.getElapsed() > time;
    }
    lt(other) {
        if (!(other instanceof Timer))
            throw new TypeError("Invalid arguments");
        if (other._started === INVALID)
            return false;
        if (this._started === INVALID)
            return true;
        return this._started > other._started;
    }
    gt(other) {
        if (!(other instanceof Timer))
            throw new TypeError("Invalid arguments");
        if (this._started === INVALID)
            return false;
        if (other._started === INVALID)
            return true;
        return this._started < other._started;
    }
    le(other) {
        if (!(other instanceof Timer))
            throw new TypeError("Invalid arguments");
        if (this._started === INVALID)
            return true;
        if (other._started === INVALID)
            return false;
        return this._started >= other._started;
    }
    ge(other) {
        if (!(other instanceof Timer))
            throw new TypeError("Invalid arguments");
        if (other._started === INVALID)
            return true;
        if (this._started === INVALID)
            return false;
        return this._started <= other._started;
    }
    eq(other) {
        if (!(other instanceof Timer))
            throw new TypeError("Invalid arguments");
        return this._started === other._started;
    }
    ne(other) {
        if (!(other instanceof Timer))
            throw new TypeError("Invalid arguments");
        return this._started !== other._started;
    }
    clone() {
        return new Timer(this);
    }
    static sleep(a, b) {
        if (typeof a !== "number" && !(a instanceof Range_1.Range))
            throw new TypeError("Invalid arguments");
        let delay;
        if (a instanceof Range_1.Range) {
            delay = a.getRandom();
        }
        else if (b !== undefined) {
            delay = new Range_1.Range(a, b).getRandom();
        }
        else {
            delay = a;
        }
        if (delay < 0)
            return;
        sleepSync(delay);
    }
    static getCpuTime() {
        return getCpuTimeMs();
    }
    static compare(a, b) {
        if (a.lt(b))
            return -1;
        if (a.gt(b))
            return 1;
        return 0;
    }
}
exports.Timer = Timer;
