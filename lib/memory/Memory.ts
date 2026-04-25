import { Process } from "../process";
import { getNative } from "../backend";

export class Stats {
  systemReads: number = 0;
  cachedReads: number = 0;
  systemWrites: number = 0;
  accessWrites: number = 0;
  readErrors: number = 0;
  writeErrors: number = 0;

  eq(other: Stats): boolean {
    if (!(other instanceof Stats)) throw new TypeError("Invalid arguments");
    return this.systemReads === other.systemReads
      && this.cachedReads === other.cachedReads
      && this.systemWrites === other.systemWrites
      && this.accessWrites === other.accessWrites
      && this.readErrors === other.readErrors
      && this.writeErrors === other.writeErrors;
  }

  ne(other: Stats): boolean {
    return !this.eq(other);
  }

  clone(): Stats {
    const copy = new Stats();
    copy.systemReads = this.systemReads;
    copy.cachedReads = this.cachedReads;
    copy.systemWrites = this.systemWrites;
    copy.accessWrites = this.accessWrites;
    copy.readErrors = this.readErrors;
    copy.writeErrors = this.writeErrors;
    return copy;
  }
}

export class Region {
  valid: boolean = false;
  bound: boolean = false;
  start: number = 0;
  stop: number = 0;
  size: number = 0;
  readable: boolean = false;
  writable: boolean = false;
  executable: boolean = false;
  access: number = 0;
  private: boolean = false;
  guarded: boolean = false;

  contains(address: number): boolean {
    return address >= this.start && address < this.stop;
  }

  lt(value: Region | number): boolean {
    if (value instanceof Region) return this.start < value.start;
    if (typeof value === "number") return this.start < value;
    throw new TypeError("Invalid arguments");
  }

  gt(value: Region | number): boolean {
    if (value instanceof Region) return this.start > value.start;
    if (typeof value === "number") return this.start > value;
    throw new TypeError("Invalid arguments");
  }

  le(value: Region | number): boolean {
    if (value instanceof Region) return this.start <= value.start;
    if (typeof value === "number") return this.start <= value;
    throw new TypeError("Invalid arguments");
  }

  ge(value: Region | number): boolean {
    if (value instanceof Region) return this.start >= value.start;
    if (typeof value === "number") return this.start >= value;
    throw new TypeError("Invalid arguments");
  }

  eq(value: Region | number): boolean {
    if (value instanceof Region) return this.start === value.start && this.size === value.size;
    if (typeof value === "number") return this.start === value;
    throw new TypeError("Invalid arguments");
  }

  ne(value: Region | number): boolean {
    if (value instanceof Region) return this.start !== value.start || this.size !== value.size;
    if (typeof value === "number") return this.start !== value;
    throw new TypeError("Invalid arguments");
  }

  clone(): Region {
    const copy = new Region();
    copy.valid = this.valid;
    copy.bound = this.bound;
    copy.start = this.start;
    copy.stop = this.stop;
    copy.size = this.size;
    copy.readable = this.readable;
    copy.writable = this.writable;
    copy.executable = this.executable;
    copy.access = this.access;
    copy["private"] = this["private"];
    copy.guarded = this.guarded;
    return copy;
  }

  static compare(a: Region, b: Region): number {
    if (a.lt(b)) return -1;
    if (a.gt(b)) return 1;
    return 0;
  }
}

const enum DataType {
  Int8 = 1,
  Int16 = 2,
  Int32 = 3,
  Int64 = 4,
  Real32 = 5,
  Real64 = 6,
  Bool = 7,
  String = 8,
}

export class Memory {
  static readonly DEFAULT = 0;
  static readonly SKIP_ERRORS = 1;
  static readonly AUTO_ACCESS = 2;
  static readonly Stats = Stats;
  static readonly Region = Region;

  private _pid: number;

  constructor(process?: Process | Memory) {
    if (process instanceof Memory) {
      this._pid = process._pid;
    } else if (process instanceof Process) {
      this._pid = process.getPID();
    } else {
      this._pid = 0;
    }
  }

  async isValid(): Promise<boolean> {
    return getNative("memory").memory_isValid(this._pid);
  }

  getProcess(): Process {
    return new Process(this._pid);
  }

  getStats(reset?: boolean): Stats {
    return new Stats();
  }

  async getRegion(address: number): Promise<Region> {
    const r = getNative("memory").memory_getRegion(this._pid, address);
    const region = new Region();
    region.valid = r.valid;
    region.bound = r.bound;
    region.start = r.start;
    region.stop = r.stop;
    region.size = r.size;
    region.readable = r.readable;
    region.writable = r.writable;
    region.executable = r.executable;
    region.access = r.access;
    region["private"] = r["private"];
    region.guarded = r.guarded;
    return region;
  }

  async getRegions(start?: number, stop?: number): Promise<Region[]> {
    interface RawRegion {
      valid: boolean; bound: boolean; start: number; stop: number; size: number;
      readable: boolean; writable: boolean; executable: boolean; access: number;
      private: boolean; guarded: boolean;
    }
    const regions: RawRegion[] = getNative("memory").memory_getRegions(this._pid, start, stop);
    return regions.map((r) => {
      const region = new Region();
      region.valid = r.valid;
      region.bound = r.bound;
      region.start = r.start;
      region.stop = r.stop;
      region.size = r.size;
      region.readable = r.readable;
      region.writable = r.writable;
      region.executable = r.executable;
      region.access = r.access;
      region["private"] = r["private"];
      region.guarded = r.guarded;
      return region;
    });
  }

  async setAccess(region: Region, readable: boolean, writable: boolean, executable: boolean): Promise<boolean>;
  async setAccess(region: Region, flags: number): Promise<boolean>;
  async setAccess(region: Region, a: boolean | number, b?: boolean, c?: boolean): Promise<boolean> {
    if (typeof a === "number") {
      return getNative("memory").memory_setAccessFlags(this._pid, region.start, a);
    }
    return getNative("memory").memory_setAccess(this._pid, region.start, a, b!, c!);
  }

  async getPtrSize(): Promise<number> {
    return getNative("memory").memory_getPtrSize(this._pid);
  }

  async getMinAddress(): Promise<number> {
    return getNative("memory").memory_getMinAddress(this._pid);
  }

  async getMaxAddress(): Promise<number> {
    return getNative("memory").memory_getMaxAddress(this._pid);
  }

  async getPageSize(): Promise<number> {
    return getNative("memory").memory_getPageSize(this._pid);
  }

  async find(pattern: string, start?: number, stop?: number, limit?: number, flags?: string): Promise<number[]> {
    return getNative("memory").memory_find(this._pid, pattern, start, stop, limit, flags);
  }

  async readData(address: number, buffer: Buffer, length?: number, flags?: number): Promise<number> {
    const len = length !== undefined ? length : buffer.length;
    if (buffer.length < len) throw new RangeError("Buffer is too small");
    const result = getNative("memory").memory_readData(this._pid, address, len, flags);
    if (!result) return 0;
    result.copy(buffer, 0, 0, len);
    return len;
  }

  async writeData(address: number, buffer: Buffer, length?: number, flags?: number): Promise<number> {
    const len = length !== undefined ? length : buffer.length;
    if (buffer.length < len) throw new RangeError("Buffer is too small");
    return getNative("memory").memory_writeData(this._pid, address, buffer, flags);
  }

  async readInt8(address: number, count?: number, stride?: number): Promise<number | number[] | null> {
    return this._readType(address, DataType.Int8, 1, count, stride);
  }

  async readInt16(address: number, count?: number, stride?: number): Promise<number | number[] | null> {
    return this._readType(address, DataType.Int16, 2, count, stride);
  }

  async readInt32(address: number, count?: number, stride?: number): Promise<number | number[] | null> {
    return this._readType(address, DataType.Int32, 4, count, stride);
  }

  async readInt64(address: number, count?: number, stride?: number): Promise<number | number[] | null> {
    return this._readType(address, DataType.Int64, 8, count, stride);
  }

  async readReal32(address: number, count?: number, stride?: number): Promise<number | number[] | null> {
    return this._readType(address, DataType.Real32, 4, count, stride);
  }

  async readReal64(address: number, count?: number, stride?: number): Promise<number | number[] | null> {
    return this._readType(address, DataType.Real64, 8, count, stride);
  }

  async readBool(address: number, count?: number, stride?: number): Promise<boolean | boolean[] | null> {
    return this._readType(address, DataType.Bool, 1, count, stride) as any;
  }

  async readString(address: number, length: number, count?: number, stride?: number): Promise<string | string[] | null> {
    return this._readType(address, DataType.String, length, count, stride) as any;
  }

  async readPtr(address: number, count?: number, stride?: number): Promise<number | number[] | null> {
    const ptrSize = await this.getPtrSize();
    return this._readType(address, ptrSize === 4 ? DataType.Int32 : DataType.Int64, ptrSize, count, stride);
  }

  async writeInt8(address: number, value: number): Promise<boolean> {
    return this._writeType(address, value, DataType.Int8, 1);
  }

  async writeInt16(address: number, value: number): Promise<boolean> {
    return this._writeType(address, value, DataType.Int16, 2);
  }

  async writeInt32(address: number, value: number): Promise<boolean> {
    return this._writeType(address, value, DataType.Int32, 4);
  }

  async writeInt64(address: number, value: number): Promise<boolean> {
    return this._writeType(address, value, DataType.Int64, 8);
  }

  async writeReal32(address: number, value: number): Promise<boolean> {
    return this._writeType(address, value, DataType.Real32, 4);
  }

  async writeReal64(address: number, value: number): Promise<boolean> {
    return this._writeType(address, value, DataType.Real64, 8);
  }

  async writeBool(address: number, value: boolean): Promise<boolean> {
    return this._writeType(address, value, DataType.Bool, 1);
  }

  async writeString(address: number, value: string, length?: number): Promise<boolean> {
    return this._writeType(address, value, DataType.String, length || 0);
  }

  async writePtr(address: number, value: number): Promise<boolean> {
    const ptrSize = await this.getPtrSize();
    return this._writeType(address, value, ptrSize === 4 ? DataType.Int32 : DataType.Int64, ptrSize);
  }

  clone(): Memory {
    return new Memory(new Process(this._pid));
  }

  private _readType(address: number, type: DataType, length: number, count?: number, stride?: number): any {
    const native = getNative("memory");
    const c = count || 1;
    const s = stride || 0;
    if (c === 0 || length === 0) return null;

    if (c === 1) {
      const buf = native.memory_readData(this._pid, address, length);
      if (!buf) return null;
      switch (type) {
        case DataType.Int8:    return buf.readInt8(0);
        case DataType.Int16:   return buf.readInt16LE(0);
        case DataType.Int32:   return buf.readInt32LE(0);
        case DataType.Int64:   return Number(buf.readBigInt64LE(0));
        case DataType.Real32:  return buf.readFloatLE(0);
        case DataType.Real64:  return buf.readDoubleLE(0);
        case DataType.Bool:    return buf[0] !== 0;
        case DataType.String:  return buf.toString("utf8", 0, length);
        default: return null;
      }
    }

    const effectiveStride = s === 0 ? length : s;
    if (effectiveStride < length) throw new RangeError("Stride is too small");
    const totalSize = c * effectiveStride + length - effectiveStride;
    const buf = native.memory_readData(this._pid, address, totalSize);
    if (!buf) return null;

    const result: any[] = [];
    for (let i = 0; i < c; i++) {
      const offset = i * effectiveStride;
      switch (type) {
        case DataType.Int8:    result.push(buf.readInt8(offset)); break;
        case DataType.Int16:   result.push(buf.readInt16LE(offset)); break;
        case DataType.Int32:   result.push(buf.readInt32LE(offset)); break;
        case DataType.Int64:   result.push(Number(buf.readBigInt64LE(offset))); break;
        case DataType.Real32:  result.push(buf.readFloatLE(offset)); break;
        case DataType.Real64:  result.push(buf.readDoubleLE(offset)); break;
        case DataType.Bool:    result.push(buf[offset] !== 0); break;
        case DataType.String:  result.push(buf.toString("utf8", offset, offset + length)); break;
      }
    }
    return result;
  }

  private _writeType(address: number, value: any, type: DataType, length: number): boolean {
    const native = getNative("memory");
    if (type === DataType.String) {
      const str = value as string;
      const len = length === 0 ? str.length + 1 : length;
      if (len === 0) return true;
      if (len > str.length + 1) throw new RangeError("Length is too large");
      const buf = Buffer.alloc(len);
      buf.write(str, 0, len, "utf8");
      return native.memory_writeData(this._pid, address, buf) === len;
    }
    const buf = Buffer.alloc(length);
    switch (type) {
      case DataType.Int8:    buf.writeInt8(value, 0); break;
      case DataType.Int16:   buf.writeInt16LE(value, 0); break;
      case DataType.Int32:   buf.writeInt32LE(value, 0); break;
      case DataType.Int64:   buf.writeBigInt64LE(BigInt(Math.trunc(value)), 0); break;
      case DataType.Real32:  buf.writeFloatLE(value, 0); break;
      case DataType.Real64:  buf.writeDoubleLE(value, 0); break;
      case DataType.Bool:    buf[0] = value ? 1 : 0; break;
      default: return false;
    }
    return native.memory_writeData(this._pid, address, buf) === length;
  }
}
