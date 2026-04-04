import { Color } from "./Color";
import { Point } from "./Point";
import { Size } from "./Size";

export class Image {
  private _width: number = 0;
  private _height: number = 0;
  private _length: number = 0;
  private _data: Uint32Array | null = null;
  private _limit: number = 0;

  constructor();
  constructor(other: Image);
  constructor(size: number);
  constructor(w: number, h: number);
  constructor(a?: number | Image, b?: number) {
    if (a === undefined) return;
    if (a instanceof Image) {
      if (a._data && a._length > 0) {
        this.create(a._width, a._height);
        if (this._data) this._data.set(a._data.subarray(0, this._length));
      }
      return;
    }
    if (b !== undefined) {
      this.create(a, b);
    } else {
      this.create(a, a);
    }
  }

  isValid(): boolean { return this._data !== null && this._length > 0; }

  create(size: number): boolean;
  create(w: number, h: number): boolean;
  create(a: number | Size | { w: number; h: number }, b?: number): boolean {
    if (typeof a !== "number" && !(typeof a === "object" && a !== null && "w" in a && "h" in a)) {
      throw new TypeError("Invalid arguments");
    }
    let w: number, h: number;
    if (typeof a === "number" && b !== undefined) {
      w = a; h = b;
    } else if (typeof a === "number") {
      w = a; h = a;
    } else {
      w = a.w; h = a.h;
    }

    if (w === 0 || h === 0) return false;

    this._width = w;
    this._height = h;
    this._length = w * h;

    if (this._limit < this._length) {
      this._data = new Uint32Array(this._length);
      this._limit = this._length;
    }

    return true;
  }

  destroy(): void {
    this._width = 0;
    this._height = 0;
    this._length = 0;
    this._data = null;
    this._limit = 0;
  }

  getWidth(): number { return this._width; }
  getHeight(): number { return this._height; }
  getLength(): number { return this._length; }
  getLimit(): number { return this._limit; }

  getData(): Uint32Array | null {
    if (!this._data || this._length === 0) return null;
    return this._data.subarray(0, this._length);
  }

  getPixel(point: Point): Color;
  getPixel(index: number): Color;
  getPixel(x: number, y: number): Color;
  getPixel(a: number | Point, b?: number): Color {
    if (a instanceof Point) {
      return this._getPixelXY(a.x, a.y);
    }
    if (typeof a !== "number") throw new TypeError("Invalid arguments");
    if (b !== undefined) {
      return this._getPixelXY(a, b);
    }
    // Single index: diagonal access → getPixel(i) = getPixel(i, i)
    return this._getPixelXY(a, a);
  }

  private _getPixelXY(x: number, y: number): Color {
    if (!this._data || x >= this._width || y >= this._height) return new Color();
    return Color._fromARGB(this._data[x + y * this._width]);
  }

  setPixel(x: number, y: number, c: Color): void;
  setPixel(p: Point, c: Color): void;
  setPixel(index: number, c: Color): void;
  setPixel(a: number | Point, b: number | Color, c?: Color): void {
    if (!this._data) return;
    if (typeof a === "number" && typeof b === "number" && c instanceof Color) {
      this._setPixelXY(a, b, c);
    } else if (a instanceof Point && b instanceof Color) {
      this._setPixelXY(a.x, a.y, b);
    } else if (typeof a === "number" && b instanceof Color) {
      // Single index: diagonal access → setPixel(i, color) = setPixel(i, i, color)
      this._setPixelXY(a, a, b);
    } else {
      throw new TypeError("Invalid arguments");
    }
  }

  private _setPixelXY(x: number, y: number, c: Color): void {
    if (!this._data || x >= this._width || y >= this._height) return;
    this._data[x + y * this._width] = c.getARGB();
  }

  fill(...args: any[]): boolean {
    // Resolve color from flexible args (same as Color constructor)
    // Validate: first arg must be number, Color, or object with r/g/b
    const a0 = args[0];
    if (a0 === undefined) throw new TypeError("Invalid arguments");
    if (typeof a0 === "string") throw new TypeError("Invalid arguments");
    if (typeof a0 === "object" && a0 !== null && !(a0 instanceof Color) && !("r" in a0 && "g" in a0 && "b" in a0)) {
      throw new TypeError("Invalid arguments");
    }
    const c = a0 instanceof Color ? a0 : new Color(...(args as [any]));
    if (!this._data || this._length === 0) return false;
    const argb = c.getARGB();
    for (let i = 0; i < this._length; i++) {
      this._data[i] = argb;
    }
    return true;
  }

  swap(sw: string): boolean {
    if (typeof sw !== "string") throw new TypeError("Invalid arguments");
    if (!this._data || this._length === 0 || !sw) return false;

    let a = -1, r = -1, g = -1, b = -1;
    let count = 0;

    for (count = 0; count < sw.length; count++) {
      const ch = sw[count].toLowerCase();
      if (ch === "a" && a === -1) a = (3 - count) << 3;
      else if (ch === "r" && r === -1) r = (3 - count) << 3;
      else if (ch === "g" && g === -1) g = (3 - count) << 3;
      else if (ch === "b" && b === -1) b = (3 - count) << 3;
      else return false;
    }

    if (count !== 4) return false;

    for (let i = 0; i < this._length; i++) {
      const px = this._data[i];
      const ca = (px >>> 24) & 0xFF;
      const cr = (px >>> 16) & 0xFF;
      const cg = (px >>> 8) & 0xFF;
      const cb = px & 0xFF;
      this._data[i] = ((ca << a) | (cr << r) | (cg << g) | (cb << b)) >>> 0;
    }

    return true;
  }

  flip(h: boolean, v: boolean): boolean {
    if (typeof h !== "boolean" || typeof v !== "boolean") throw new TypeError("Invalid arguments");
    if (!this._data || this._length === 0) return false;
    if (h && v) this._flipBoth();
    else if (h && !v) this._flipH();
    else if (!h && v) this._flipV();
    return true;
  }

  private _flipBoth(): void {
    const len = Math.floor(this._length / 2);
    for (let i = 0; i < len; i++) {
      const f = this._length - 1 - i;
      const tmp = this._data![i];
      this._data![i] = this._data![f];
      this._data![f] = tmp;
    }
  }

  private _flipH(): void {
    const half = Math.floor(this._width / 2);
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < half; x++) {
        const f = this._width - 1 - x;
        const ai = x + y * this._width;
        const bi = f + y * this._width;
        const tmp = this._data![ai];
        this._data![ai] = this._data![bi];
        this._data![bi] = tmp;
      }
    }
  }

  private _flipV(): void {
    const half = Math.floor(this._height / 2);
    for (let y = 0; y < half; y++) {
      const f = this._height - 1 - y;
      for (let x = 0; x < this._width; x++) {
        const ai = x + y * this._width;
        const bi = x + f * this._width;
        const tmp = this._data![ai];
        this._data![ai] = this._data![bi];
        this._data![bi] = tmp;
      }
    }
  }

  eq(other: Image): boolean {
    if (!(other instanceof Image)) throw new TypeError("Invalid arguments");
    if (this._width !== other._width || this._height !== other._height) return false;
    if (!this._data && !other._data) return true;
    if (!this._data || !other._data) return false;
    for (let i = 0; i < this._length; i++) {
      if (this._data[i] !== other._data[i]) return false;
    }
    return true;
  }

  ne(other: Image): boolean { return !this.eq(other); }

  clone(): Image { return new Image(this); }

  toString(): string {
    return `[${this._width}x${this._height} - ${this._length}/${this._limit}]`;
  }
}

// Add internal helper to Color for pixel conversion
declare module "./Color" {
  interface Color {}
  namespace Color {
    function _fromARGB(argb: number): Color;
  }
}

Color._fromARGB = function(argb: number): Color {
  const c = new Color();
  c.a = (argb >>> 24) & 0xFF;
  c.r = (argb >>> 16) & 0xFF;
  c.g = (argb >>> 8) & 0xFF;
  c.b = argb & 0xFF;
  return c;
};
