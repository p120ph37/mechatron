import { Process } from "./Process";
import type { ModuleData } from "./Process";

function toBigInt(v: bigint | number): bigint {
  return typeof v === "bigint" ? v : BigInt(v);
}

export class Segment {
  valid: boolean = false;
  base: bigint = 0n;
  size: bigint = 0n;
  name: string = "";

  constructor() {}

  contains(value: bigint | number): boolean {
    if (typeof value !== "bigint" && typeof value !== "number") {
      throw new TypeError("Invalid arguments");
    }
    const v = toBigInt(value);
    const base = this.base;
    const stop = this.base + this.size;
    return base <= v && stop > v;
  }

  lt(value: Segment | bigint | number): boolean {
    if (value instanceof Segment) return this.base < value.base;
    if (typeof value === "bigint") return this.base < value;
    if (typeof value === "number") return this.base < BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  gt(value: Segment | bigint | number): boolean {
    if (value instanceof Segment) return this.base > value.base;
    if (typeof value === "bigint") return this.base > value;
    if (typeof value === "number") return this.base > BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  le(value: Segment | bigint | number): boolean {
    if (value instanceof Segment) return this.base <= value.base;
    if (typeof value === "bigint") return this.base <= value;
    if (typeof value === "number") return this.base <= BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  ge(value: Segment | bigint | number): boolean {
    if (value instanceof Segment) return this.base >= value.base;
    if (typeof value === "bigint") return this.base >= value;
    if (typeof value === "number") return this.base >= BigInt(value);
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
  base: bigint;
  size: bigint;
  process: Process;

  _segments: Segment[] | null = null;
  _proc: Process | null = null;

  constructor();
  constructor(other: Module);
  constructor(data: ModuleData);
  constructor(process: Process, name: string, path: string, base: bigint | number, size: bigint | number);
  constructor(a?: Module | ModuleData | Process, b?: string, c?: string, d?: bigint | number, e?: bigint | number) {
    if (a instanceof Module) {
      this.valid = a.valid;
      this.name = a.name;
      this.path = a.path;
      this.base = a.base;
      this.size = a.size;
      this.process = a.process;
    } else if (a instanceof Process && typeof b === "string") {
      // Module(process, name, path, base, size)
      this.valid = true;
      this.name = b;
      this.path = c || "";
      this.base = d !== undefined ? toBigInt(d) : 0n;
      this.size = e !== undefined ? toBigInt(e) : 0n;
      this.process = a;
    } else if (a && typeof a === "object" && "pid" in a) {
      this.valid = (a as ModuleData).valid;
      this.name = (a as ModuleData).name;
      this.path = (a as ModuleData).path;
      this.base = toBigInt((a as ModuleData).base as bigint | number);
      this.size = toBigInt((a as ModuleData).size as bigint | number);
      this.process = new Process((a as ModuleData).pid);
    } else {
      this.valid = false;
      this.name = "";
      this.path = "";
      this.base = 0n;
      this.size = 0n;
      this.process = new Process();
    }
  }

  // Getter methods (matching original C++ adapter API)
  isValid(): boolean { return this.valid; }
  getName(): string { return this.name; }
  getPath(): string { return this.path; }
  getBase(): bigint { return this.base; }
  getSize(): bigint { return this.size; }
  getProcess(): Process { return this.process; }

  contains(address: bigint | number): boolean {
    if (typeof address !== "bigint" && typeof address !== "number") {
      throw new TypeError("Invalid arguments");
    }
    const a = toBigInt(address);
    return a >= this.base && a < this.base + this.size;
  }

  lt(value: Module | bigint | number): boolean {
    if (value instanceof Module) return this.base < value.base;
    if (typeof value === "bigint") return this.base < value;
    if (typeof value === "number") return this.base < BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  gt(value: Module | bigint | number): boolean {
    if (value instanceof Module) return this.base > value.base;
    if (typeof value === "bigint") return this.base > value;
    if (typeof value === "number") return this.base > BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  le(value: Module | bigint | number): boolean {
    if (value instanceof Module) return this.base <= value.base;
    if (typeof value === "bigint") return this.base <= value;
    if (typeof value === "number") return this.base <= BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  ge(value: Module | bigint | number): boolean {
    if (value instanceof Module) return this.base >= value.base;
    if (typeof value === "bigint") return this.base >= value;
    if (typeof value === "number") return this.base >= BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  eq(value: Module | bigint | number): boolean {
    if (value instanceof Module) return this.base === value.base;
    if (typeof value === "bigint") return this.base === value;
    if (typeof value === "number") return this.base === BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  ne(value: Module | bigint | number): boolean {
    if (value instanceof Module) return this.base !== value.base;
    if (typeof value === "bigint") return this.base !== value;
    if (typeof value === "number") return this.base !== BigInt(value);
    throw new TypeError("Invalid arguments");
  }

  async getSegments(): Promise<Segment[]> {
    if (!this.valid) return [];
    if (this._segments === null) {
      const proc = this._proc || this.process;
      const rawSegs = await Process._getSegments(proc, this.base);
      this._segments = rawSegs.map((s) => {
        const seg = new Segment();
        seg.valid = s.valid;
        seg.base = toBigInt(s.base as bigint | number);
        seg.size = toBigInt(s.size as bigint | number);
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
