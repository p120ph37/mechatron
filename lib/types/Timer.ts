import { Range } from "./Range";

const INVALID = -1;

function getCpuTimeMs(): number {
  // performance.now() returns milliseconds with sub-ms precision in both Node and Bun
  return Math.floor(performance.now());
}

function sleepSync(ms: number): void {
  if (ms <= 0) return;
  // Atomics.wait provides synchronous sleep in both Node and Bun
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

export class Timer {
  private _started: number = INVALID;

  constructor();
  constructor(other: Timer);
  constructor(a?: Timer) {
    if (a instanceof Timer) {
      this._started = a._started;
    }
  }

  start(): void {
    this._started = getCpuTimeMs();
  }

  reset(): number {
    if (this._started === INVALID) return 0;
    const old = this._started;
    this._started = INVALID;
    return getCpuTimeMs() - old;
  }

  restart(): number {
    if (this._started === INVALID) {
      this._started = getCpuTimeMs();
      return 0;
    }
    const old = this._started;
    this._started = getCpuTimeMs();
    return this._started - old;
  }

  getElapsed(): number {
    if (this._started === INVALID) return 0;
    return getCpuTimeMs() - this._started;
  }

  hasStarted(): boolean {
    return this._started !== INVALID;
  }

  hasExpired(time?: number): boolean {
    if (time === undefined || typeof time !== "number") throw new TypeError("Invalid arguments");
    if (this._started === INVALID) return true;
    return this.getElapsed() > time;
  }

  lt(other?: Timer): boolean {
    if (!(other instanceof Timer)) throw new TypeError("Invalid arguments");
    if (other._started === INVALID) return false;
    if (this._started === INVALID) return true;
    return this._started > other._started;
  }

  gt(other?: Timer): boolean {
    if (!(other instanceof Timer)) throw new TypeError("Invalid arguments");
    if (this._started === INVALID) return false;
    if (other._started === INVALID) return true;
    return this._started < other._started;
  }

  le(other?: Timer): boolean {
    if (!(other instanceof Timer)) throw new TypeError("Invalid arguments");
    if (this._started === INVALID) return true;
    if (other._started === INVALID) return false;
    return this._started >= other._started;
  }

  ge(other?: Timer): boolean {
    if (!(other instanceof Timer)) throw new TypeError("Invalid arguments");
    if (other._started === INVALID) return true;
    if (this._started === INVALID) return false;
    return this._started <= other._started;
  }

  eq(other?: Timer): boolean {
    if (!(other instanceof Timer)) throw new TypeError("Invalid arguments");
    return this._started === other._started;
  }

  ne(other?: Timer): boolean {
    if (!(other instanceof Timer)) throw new TypeError("Invalid arguments");
    return this._started !== other._started;
  }

  clone(): Timer {
    return new Timer(this);
  }

  static sleep(range: Range): void;
  static sleep(min: number, max?: number): void;
  static sleep(a: Range | number, b?: number): void {
    if (typeof a !== "number" && !(a instanceof Range)) throw new TypeError("Invalid arguments");
    let delay: number;
    if (a instanceof Range) {
      delay = a.getRandom();
    } else if (b !== undefined) {
      delay = new Range(a, b).getRandom();
    } else {
      delay = a;
    }
    if (delay < 0) return;
    sleepSync(delay);
  }

  static delay(range: Range): Promise<void>;
  static delay(min: number, max?: number): Promise<void>;
  static delay(a: Range | number, b?: number): Promise<void> {
    if (typeof a !== "number" && !(a instanceof Range)) throw new TypeError("Invalid arguments");
    let ms: number;
    if (a instanceof Range) {
      ms = a.getRandom();
    } else if (b !== undefined) {
      ms = new Range(a, b).getRandom();
    } else {
      ms = a;
    }
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static getCpuTime(): number {
    return getCpuTimeMs();
  }

  static compare(a: Timer, b: Timer): number {
    if (a.lt(b)) return -1;
    if (a.gt(b)) return 1;
    return 0;
  }
}
