import { Size } from "./Size";

export class Point {
  x: number;
  y: number;

  constructor();
  constructor(other: Point);
  constructor(value: number);
  constructor(x: number, y: number);
  constructor(obj: { x: number; y: number });
  constructor(a?: number | Point | { x: number; y: number }, b?: number) {
    if (a === undefined) {
      this.x = 0; this.y = 0;
    } else if (a instanceof Point) {
      this.x = a.x; this.y = a.y;
    } else if (typeof a === "object") {
      this.x = a.x; this.y = a.y;
    } else if (b !== undefined) {
      this.x = a; this.y = b;
    } else {
      this.x = a; this.y = a;
    }
  }

  isZero(): boolean { return this.x === 0 && this.y === 0; }

  toSize(): Size { return new Size(this.x, this.y); }

  add(other: Point | { x: number; y: number } | number, b?: number): Point {
    const p = Point._resolve(other, b);
    return new Point(this.x + p.x, this.y + p.y);
  }

  sub(other: Point | { x: number; y: number } | number, b?: number): Point {
    const p = Point._resolve(other, b);
    return new Point(this.x - p.x, this.y - p.y);
  }

  neg(): Point { return new Point(-this.x, -this.y); }

  eq(...args: any[]): boolean {
    if (args.length === 0) return false;
    const a0 = args[0];
    if (a0 instanceof Point) return this.x === a0.x && this.y === a0.y;
    if (typeof a0 === "object" && a0 !== null && "x" in a0 && "y" in a0) {
      return this.x === a0.x && this.y === a0.y;
    }
    if (typeof a0 === "number" && args.length >= 2) return this.x === a0 && this.y === args[1];
    if (typeof a0 === "number") return this.x === a0 && this.y === a0;
    throw new TypeError("Invalid arguments");
  }

  ne(...args: any[]): boolean {
    if (args.length === 0) return true;
    return !this.eq(...args);
  }

  clone(): Point { return new Point(this); }

  toString(): string { return `[${this.x}, ${this.y}]`; }

  static normalize(a?: number | Point | { x: number; y: number }, b?: number): { x: number; y: number } {
    if (a instanceof Point) return { x: a.x, y: a.y };
    if (typeof a === "object" && a !== null && a !== undefined) return { x: a.x, y: a.y };
    if (b !== undefined) return { x: a as number, y: b };
    if (typeof a === "number") return { x: a, y: a };
    return { x: 0, y: 0 };
  }

  /** @internal */
  static _resolve(a: Point | { x: number; y: number } | number | undefined, b?: number): { x: number; y: number } {
    if (a instanceof Point) return a;
    if (typeof a === "object" && a !== null && a !== undefined) return a;
    if (b !== undefined) return { x: a as number, y: b };
    if (typeof a === "number") return { x: a, y: a };
    return { x: 0, y: 0 };
  }
}
