export class Range {
  min: number;
  max: number;
  private _state: number;

  constructor();
  constructor(other: Range);
  constructor(value: number);
  constructor(min: number, max: number);
  constructor(obj: { min: number; max: number });
  constructor(a?: number | Range | { min: number; max: number }, b?: number) {
    this._state = (Math.floor(Date.now() / 1000) & 0x7FFFFFFF) >>> 0;
    if (a === undefined) {
      this.min = 0; this.max = 0;
    } else if (a instanceof Range) {
      this.min = a.min; this.max = a.max;
    } else if (typeof a === "object") {
      this.min = a.min; this.max = a.max;
    } else if (b !== undefined) {
      this.min = a; this.max = b;
    } else {
      this.min = a; this.max = a;
    }
  }

  getRange(): number { return this.max - this.min; }

  setRange(value: number): void;
  setRange(min: number, max: number): void;
  setRange(a: Range): void;
  setRange(a?: number | Range | { min: number; max: number }, b?: number): void {
    if (a === undefined) return;
    if (a instanceof Range) {
      this.min = a.min; this.max = a.max;
    } else if (typeof a === "object") {
      this.min = a.min; this.max = a.max;
    } else if (b !== undefined) {
      this.min = a; this.max = b;
    } else {
      this.min = a; this.max = a;
    }
  }

  contains(value: number, inclusive?: boolean): boolean {
    if (typeof value !== "number") throw new TypeError("Invalid arguments");
    if (inclusive !== undefined && typeof inclusive !== "boolean") throw new TypeError("Invalid arguments");
    const incl = inclusive !== undefined ? inclusive : true;
    return incl
      ? this.min <= value && value <= this.max
      : this.min < value && value < this.max;
  }

  getRandom(): number {
    if (this.min >= this.max) return this.min;
    // LCG with 32-bit unsigned math (matching C++ uint32 overflow behavior)
    this._state = ((Math.imul(this._state, 1103515245) + 12345) & 0x7FFFFFFF) >>> 0;
    return (this._state % (this.max - this.min)) + this.min;
  }

  eq(other: Range): boolean;
  eq(other: { min: number; max: number }): boolean;
  eq(value: number): boolean;
  eq(min: number, max: number): boolean;
  eq(...args: any[]): boolean {
    if (args.length === 0) return false;
    const a0 = args[0];
    if (a0 instanceof Range) return this.min === a0.min && this.max === a0.max;
    if (typeof a0 === "object" && a0 !== null && "min" in a0 && "max" in a0) {
      return this.min === a0.min && this.max === a0.max;
    }
    if (typeof a0 === "number" && args.length >= 2) return this.min === a0 && this.max === args[1];
    if (typeof a0 === "number") return this.min === a0 && this.max === a0;
    throw new TypeError("Invalid arguments");
  }

  ne(...args: any[]): boolean {
    if (args.length === 0) return true;
    return !this.eq(...args);
  }

  clone(): Range {
    return new Range(this);
  }

  toString(): string {
    return `[${this.min}, ${this.max}]`;
  }

  static normalize(a?: number | Range | { min: number; max: number }, b?: number): { min: number; max: number } {
    if (a instanceof Range) return { min: a.min, max: a.max };
    if (typeof a === "object" && a !== null && a !== undefined) return { min: a.min, max: a.max };
    if (b !== undefined) return { min: a as number, max: b };
    if (typeof a === "number") return { min: a, max: a };
    return { min: 0, max: 0 };
  }
}
