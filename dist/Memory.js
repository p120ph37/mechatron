"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Memory = exports.Region = exports.Stats = void 0;
const Process_1 = require("./Process");
function getNative() {
    const { getNativeBackend } = require("./native");
    return getNativeBackend();
}
class Stats {
    systemReads = 0;
    cachedReads = 0;
    systemWrites = 0;
    accessWrites = 0;
    readErrors = 0;
    writeErrors = 0;
    eq(other) {
        if (!(other instanceof Stats))
            throw new TypeError("Invalid arguments");
        return this.systemReads === other.systemReads
            && this.cachedReads === other.cachedReads
            && this.systemWrites === other.systemWrites
            && this.accessWrites === other.accessWrites
            && this.readErrors === other.readErrors
            && this.writeErrors === other.writeErrors;
    }
    ne(other) {
        return !this.eq(other);
    }
    clone() {
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
exports.Stats = Stats;
class Region {
    valid = false;
    bound = false;
    start = 0;
    stop = 0;
    size = 0;
    readable = false;
    writable = false;
    executable = false;
    access = 0;
    private = false;
    guarded = false;
    contains(address) {
        return address >= this.start && address < this.stop;
    }
    lt(value) {
        if (value instanceof Region)
            return this.start < value.start;
        if (typeof value === "number")
            return this.start < value;
        throw new TypeError("Invalid arguments");
    }
    gt(value) {
        if (value instanceof Region)
            return this.start > value.start;
        if (typeof value === "number")
            return this.start > value;
        throw new TypeError("Invalid arguments");
    }
    le(value) {
        if (value instanceof Region)
            return this.start <= value.start;
        if (typeof value === "number")
            return this.start <= value;
        throw new TypeError("Invalid arguments");
    }
    ge(value) {
        if (value instanceof Region)
            return this.start >= value.start;
        if (typeof value === "number")
            return this.start >= value;
        throw new TypeError("Invalid arguments");
    }
    eq(value) {
        if (value instanceof Region)
            return this.start === value.start && this.size === value.size;
        if (typeof value === "number")
            return this.start === value;
        throw new TypeError("Invalid arguments");
    }
    ne(value) {
        if (value instanceof Region)
            return this.start !== value.start || this.size !== value.size;
        if (typeof value === "number")
            return this.start !== value;
        throw new TypeError("Invalid arguments");
    }
    clone() {
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
    static compare(a, b) {
        if (a.lt(b))
            return -1;
        if (a.gt(b))
            return 1;
        return 0;
    }
}
exports.Region = Region;
class Memory {
    static DEFAULT = 0;
    static SKIP_ERRORS = 1;
    static AUTO_ACCESS = 2;
    static Stats = Stats;
    static Region = Region;
    _pid;
    constructor(process) {
        if (process instanceof Memory) {
            this._pid = process._pid;
        }
        else if (process instanceof Process_1.Process) {
            this._pid = process.getPID();
        }
        else {
            this._pid = 0;
        }
    }
    isValid() {
        return getNative().memory_isValid(this._pid);
    }
    getProcess() {
        return new Process_1.Process(this._pid);
    }
    getStats(reset) {
        // Stats are tracked in the native layer; for now return empty
        // The native backend doesn't expose stats directly in our thin interface
        return new Stats();
    }
    getRegion(address) {
        const r = getNative().memory_getRegion(this._pid, address);
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
    getRegions(start, stop) {
        const regions = getNative().memory_getRegions(this._pid, start, stop);
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
    setAccess(region, a, b, c) {
        if (typeof a === "number") {
            return getNative().memory_setAccessFlags(this._pid, region.start, a);
        }
        return getNative().memory_setAccess(this._pid, region.start, a, b, c);
    }
    getPtrSize() {
        return getNative().memory_getPtrSize(this._pid);
    }
    getMinAddress() {
        return getNative().memory_getMinAddress(this._pid);
    }
    getMaxAddress() {
        return getNative().memory_getMaxAddress(this._pid);
    }
    getPageSize() {
        return getNative().memory_getPageSize(this._pid);
    }
    find(pattern, start, stop, limit, flags) {
        return getNative().memory_find(this._pid, pattern, start, stop, limit, flags);
    }
    createCache(address, size, blockSize, maxBlocks, flags) {
        return getNative().memory_createCache(this._pid, address, size, blockSize, maxBlocks, flags);
    }
    clearCache() {
        getNative().memory_clearCache(this._pid);
    }
    deleteCache() {
        getNative().memory_deleteCache(this._pid);
    }
    isCaching() {
        return getNative().memory_isCaching(this._pid);
    }
    getCacheSize() {
        return getNative().memory_getCacheSize(this._pid);
    }
    readData(address, buffer, length, flags) {
        const len = length !== undefined ? length : buffer.length;
        if (buffer.length < len)
            throw new RangeError("Buffer is too small");
        const result = getNative().memory_readData(this._pid, address, len, flags);
        if (!result)
            return 0;
        result.copy(buffer, 0, 0, len);
        return len;
    }
    writeData(address, buffer, length, flags) {
        const len = length !== undefined ? length : buffer.length;
        if (buffer.length < len)
            throw new RangeError("Buffer is too small");
        return getNative().memory_writeData(this._pid, address, buffer, flags);
    }
    readInt8(address, count, stride) {
        return this._readType(address, 1 /* DataType.Int8 */, 1, count, stride);
    }
    readInt16(address, count, stride) {
        return this._readType(address, 2 /* DataType.Int16 */, 2, count, stride);
    }
    readInt32(address, count, stride) {
        return this._readType(address, 3 /* DataType.Int32 */, 4, count, stride);
    }
    readInt64(address, count, stride) {
        return this._readType(address, 4 /* DataType.Int64 */, 8, count, stride);
    }
    readReal32(address, count, stride) {
        return this._readType(address, 5 /* DataType.Real32 */, 4, count, stride);
    }
    readReal64(address, count, stride) {
        return this._readType(address, 6 /* DataType.Real64 */, 8, count, stride);
    }
    readBool(address, count, stride) {
        return this._readType(address, 7 /* DataType.Bool */, 1, count, stride);
    }
    readString(address, length, count, stride) {
        return this._readType(address, 8 /* DataType.String */, length, count, stride);
    }
    readPtr(address, count, stride) {
        const ptrSize = this.getPtrSize();
        return this._readType(address, ptrSize === 4 ? 3 /* DataType.Int32 */ : 4 /* DataType.Int64 */, ptrSize, count, stride);
    }
    writeInt8(address, value) {
        return this._writeType(address, value, 1 /* DataType.Int8 */, 1);
    }
    writeInt16(address, value) {
        return this._writeType(address, value, 2 /* DataType.Int16 */, 2);
    }
    writeInt32(address, value) {
        return this._writeType(address, value, 3 /* DataType.Int32 */, 4);
    }
    writeInt64(address, value) {
        return this._writeType(address, value, 4 /* DataType.Int64 */, 8);
    }
    writeReal32(address, value) {
        return this._writeType(address, value, 5 /* DataType.Real32 */, 4);
    }
    writeReal64(address, value) {
        return this._writeType(address, value, 6 /* DataType.Real64 */, 8);
    }
    writeBool(address, value) {
        return this._writeType(address, value, 7 /* DataType.Bool */, 1);
    }
    writeString(address, value, length) {
        return this._writeType(address, value, 8 /* DataType.String */, length || 0);
    }
    writePtr(address, value) {
        const ptrSize = this.getPtrSize();
        return this._writeType(address, value, ptrSize === 4 ? 3 /* DataType.Int32 */ : 4 /* DataType.Int64 */, ptrSize);
    }
    clone() {
        return new Memory(new Process_1.Process(this._pid));
    }
    _readType(address, type, length, count, stride) {
        const native = getNative();
        const c = count || 1;
        const s = stride || 0;
        if (c === 0 || length === 0)
            return null;
        if (c === 1) {
            const buf = native.memory_readData(this._pid, address, length);
            if (!buf)
                return null;
            switch (type) {
                case 1 /* DataType.Int8 */: return buf.readInt8(0);
                case 2 /* DataType.Int16 */: return buf.readInt16LE(0);
                case 3 /* DataType.Int32 */: return buf.readInt32LE(0);
                case 4 /* DataType.Int64 */: return Number(buf.readBigInt64LE(0));
                case 5 /* DataType.Real32 */: return buf.readFloatLE(0);
                case 6 /* DataType.Real64 */: return buf.readDoubleLE(0);
                case 7 /* DataType.Bool */: return buf[0] !== 0;
                case 8 /* DataType.String */: return buf.toString("utf8", 0, length);
                default: return null;
            }
        }
        const effectiveStride = s === 0 ? length : s;
        if (effectiveStride < length)
            throw new RangeError("Stride is too small");
        const totalSize = c * effectiveStride + length - effectiveStride;
        const buf = native.memory_readData(this._pid, address, totalSize);
        if (!buf)
            return null;
        const result = [];
        for (let i = 0; i < c; i++) {
            const offset = i * effectiveStride;
            switch (type) {
                case 1 /* DataType.Int8 */:
                    result.push(buf.readInt8(offset));
                    break;
                case 2 /* DataType.Int16 */:
                    result.push(buf.readInt16LE(offset));
                    break;
                case 3 /* DataType.Int32 */:
                    result.push(buf.readInt32LE(offset));
                    break;
                case 4 /* DataType.Int64 */:
                    result.push(Number(buf.readBigInt64LE(offset)));
                    break;
                case 5 /* DataType.Real32 */:
                    result.push(buf.readFloatLE(offset));
                    break;
                case 6 /* DataType.Real64 */:
                    result.push(buf.readDoubleLE(offset));
                    break;
                case 7 /* DataType.Bool */:
                    result.push(buf[offset] !== 0);
                    break;
                case 8 /* DataType.String */:
                    result.push(buf.toString("utf8", offset, offset + length));
                    break;
            }
        }
        return result;
    }
    _writeType(address, value, type, length) {
        const native = getNative();
        if (type === 8 /* DataType.String */) {
            const str = value;
            const len = length === 0 ? str.length + 1 : length;
            if (len === 0)
                return true;
            if (len > str.length + 1)
                throw new RangeError("Length is too large");
            const buf = Buffer.alloc(len);
            buf.write(str, 0, len, "utf8");
            return native.memory_writeData(this._pid, address, buf) === len;
        }
        const buf = Buffer.alloc(length);
        switch (type) {
            case 1 /* DataType.Int8 */:
                buf.writeInt8(value, 0);
                break;
            case 2 /* DataType.Int16 */:
                buf.writeInt16LE(value, 0);
                break;
            case 3 /* DataType.Int32 */:
                buf.writeInt32LE(value, 0);
                break;
            case 4 /* DataType.Int64 */:
                buf.writeBigInt64LE(BigInt(Math.trunc(value)), 0);
                break;
            case 5 /* DataType.Real32 */:
                buf.writeFloatLE(value, 0);
                break;
            case 6 /* DataType.Real64 */:
                buf.writeDoubleLE(value, 0);
                break;
            case 7 /* DataType.Bool */:
                buf[0] = value ? 1 : 0;
                break;
            default: return false;
        }
        return native.memory_writeData(this._pid, address, buf) === length;
    }
}
exports.Memory = Memory;
