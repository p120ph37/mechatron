import { Process } from "./Process";
import type { ModuleData } from "./Process";

export class Segment {
  valid: boolean = false;
  base: number = 0;
  size: number = 0;
  name: string = "";

  constructor() {
    // Allow calling without new
    if (!(this instanceof Segment)) {
      return new Segment();
    }
  }

  contains(value: number): boolean {
    if (typeof value !== "number") throw new TypeError("Invalid arguments");
    const base = this.base;
    const stop = this.base + this.size;
    return base <= value && stop > value;
  }

  lt(value: Segment | number): boolean {
    if (value instanceof Segment) return this.base < value.base;
    if (typeof value === "number") return this.base < value;
    throw new TypeError("Invalid arguments");
  }

  gt(value: Segment | number): boolean {
    if (value instanceof Segment) return this.base > value.base;
    if (typeof value === "number") return this.base > value;
    throw new TypeError("Invalid arguments");
  }

  le(value: Segment | number): boolean {
    if (value instanceof Segment) return this.base <= value.base;
    if (typeof value === "number") return this.base <= value;
    throw new TypeError("Invalid arguments");
  }

  ge(value: Segment | number): boolean {
    if (value instanceof Segment) return this.base >= value.base;
    if (typeof value === "number") return this.base >= value;
    throw new TypeError("Invalid arguments");
  }

  eq(segment: Segment): boolean {
    if (!(segment instanceof Segment)) throw new TypeError("Invalid arguments");
    return this.valid === segment.valid
      && this.base === segment.base
      && this.size === segment.size
      && this.name === segment.name;
  }

  ne(segment: Segment): boolean {
    if (!(segment instanceof Segment)) throw new TypeError("Invalid arguments");
    return this.valid !== segment.valid
      || this.base !== segment.base
      || this.size !== segment.size
      || this.name !== segment.name;
  }

  clone(): Segment {
    const copy = new Segment();
    copy.valid = this.valid;
    copy.base = this.base;
    copy.size = this.size;
    copy.name = this.name;
    return copy;
  }

  static compare(a: Segment, b: Segment): number {
    if (a.lt(b)) return -1;
    if (a.gt(b)) return 1;
    return 0;
  }
}

export class Module {
  valid: boolean;
  name: string;
  path: string;
  base: number;
  size: number;
  process: Process;

  _segments: Segment[] | null = null;
  _proc: Process | null = null;

  constructor();
  constructor(other: Module);
  constructor(data: ModuleData);
  constructor(a?: Module | ModuleData) {
    if (a instanceof Module) {
      this.valid = a.valid;
      this.name = a.name;
      this.path = a.path;
      this.base = a.base;
      this.size = a.size;
      this.process = a.process;
    } else if (a && typeof a === "object" && "pid" in a) {
      this.valid = a.valid;
      this.name = a.name;
      this.path = a.path;
      this.base = a.base;
      this.size = a.size;
      this.process = new Process(a.pid);
    } else {
      this.valid = false;
      this.name = "";
      this.path = "";
      this.base = 0;
      this.size = 0;
      this.process = new Process();
    }
  }

  contains(address: number): boolean {
    return address >= this.base && address < this.base + this.size;
  }

  lt(value: Module | number): boolean {
    if (value instanceof Module) return this.base < value.base;
    if (typeof value === "number") return this.base < value;
    throw new TypeError("Invalid arguments");
  }

  gt(value: Module | number): boolean {
    if (value instanceof Module) return this.base > value.base;
    if (typeof value === "number") return this.base > value;
    throw new TypeError("Invalid arguments");
  }

  le(value: Module | number): boolean {
    if (value instanceof Module) return this.base <= value.base;
    if (typeof value === "number") return this.base <= value;
    throw new TypeError("Invalid arguments");
  }

  ge(value: Module | number): boolean {
    if (value instanceof Module) return this.base >= value.base;
    if (typeof value === "number") return this.base >= value;
    throw new TypeError("Invalid arguments");
  }

  eq(value: Module | number): boolean {
    if (value instanceof Module) return this.base === value.base;
    if (typeof value === "number") return this.base === value;
    throw new TypeError("Invalid arguments");
  }

  ne(value: Module | number): boolean {
    if (value instanceof Module) return this.base !== value.base;
    if (typeof value === "number") return this.base !== value;
    throw new TypeError("Invalid arguments");
  }

  getSegments(): Segment[] {
    if (!this.valid) return [];
    if (this._segments === null) {
      const proc = this._proc || this.process;
      const rawSegs = Process._getSegments(proc, this.base);
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

  clone(): Module {
    const copy = new Module(this);
    if (this._segments !== null && this._segments !== undefined) {
      copy._segments = this._segments.map((s) => s.clone());
    } else {
      copy._segments = null;
    }
    return copy;
  }

  static compare(a: Module, b: Module): number {
    if (a.lt(b)) return -1;
    if (a.gt(b)) return 1;
    return 0;
  }
}
