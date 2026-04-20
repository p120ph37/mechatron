/**
 * D-Bus wire protocol marshaling/unmarshaling.
 *
 * Implements just enough of the D-Bus binary protocol to speak to the
 * session bus: EXTERNAL auth, method calls, method returns, error
 * replies, and signal reception.  Always uses little-endian encoding.
 *
 * Reference: https://dbus.freedesktop.org/doc/dbus-specification.html
 */

// ─── Constants ─────────────────────────────────────────────────────

export const PROTO_VERSION = 1;

export const MSG_METHOD_CALL = 1;
export const MSG_METHOD_RETURN = 2;
export const MSG_ERROR = 3;
export const MSG_SIGNAL = 4;

export const FLAG_NO_REPLY_EXPECTED = 0x01;
export const FLAG_NO_AUTO_START = 0x02;

export const HDR_PATH = 1;         // OBJECT_PATH
export const HDR_INTERFACE = 2;    // STRING
export const HDR_MEMBER = 3;       // STRING
export const HDR_ERROR_NAME = 4;   // STRING
export const HDR_REPLY_SERIAL = 5; // UINT32
export const HDR_DESTINATION = 6;  // STRING
export const HDR_SENDER = 7;       // STRING
export const HDR_SIGNATURE = 8;    // SIGNATURE
export const HDR_UNIX_FDS = 9;     // UINT32

// ─── Alignment ─────────────────────────────────────────────────────

const ALIGN: Record<string, number> = {
  y: 1, b: 4, n: 2, q: 2, i: 4, u: 4, x: 8, t: 8,
  d: 8, s: 4, o: 4, g: 1, a: 4, "(": 8, "{": 8, v: 1,
  h: 4,
};

function alignOf(typeCode: string): number {
  return ALIGN[typeCode] ?? 1;
}

function pad(offset: number, alignment: number): number {
  const rem = offset % alignment;
  return rem === 0 ? offset : offset + (alignment - rem);
}

// ─── Signature parsing ─────────────────────────────────────────────

export function parseSingleType(sig: string, pos: number): [string, number] {
  const c = sig[pos];
  if (!c) throw new Error("unexpected end of signature");
  switch (c) {
    case "y": case "b": case "n": case "q": case "i": case "u":
    case "x": case "t": case "d": case "s": case "o": case "g":
    case "v": case "h":
      return [c, pos + 1];
    case "a": {
      const [inner, next] = parseSingleType(sig, pos + 1);
      return ["a" + inner, next];
    }
    case "(": {
      let p = pos + 1;
      let acc = "(";
      while (sig[p] !== ")") {
        const [t, next] = parseSingleType(sig, p);
        acc += t;
        p = next;
      }
      return [acc + ")", p + 1];
    }
    case "{": {
      const [k, p1] = parseSingleType(sig, pos + 1);
      const [v, p2] = parseSingleType(sig, p1);
      if (sig[p2] !== "}") throw new Error("missing } in dict entry");
      return ["{" + k + v + "}", p2 + 1];
    }
    default:
      throw new Error(`unknown D-Bus type code: ${c}`);
  }
}

export function parseSignature(sig: string): string[] {
  const types: string[] = [];
  let pos = 0;
  while (pos < sig.length) {
    const [t, next] = parseSingleType(sig, pos);
    types.push(t);
    pos = next;
  }
  return types;
}

// ─── Marshal (write) ───────────────────────────────────────────────

export class MarshalBuffer {
  buf: Buffer;
  pos = 0;

  constructor(initialSize = 256) {
    this.buf = Buffer.alloc(initialSize);
  }

  grow(need: number): void {
    while (this.buf.length < this.pos + need) {
      const next = Buffer.alloc(this.buf.length * 2);
      this.buf.copy(next);
      this.buf = next;
    }
  }

  align(n: number): void {
    const target = pad(this.pos, n);
    if (target > this.pos) {
      this.grow(target - this.pos);
      this.buf.fill(0, this.pos, target);
      this.pos = target;
    }
  }

  writeByte(v: number): void {
    this.grow(1);
    this.buf[this.pos++] = v & 0xff;
  }

  writeBoolean(v: boolean): void {
    this.align(4);
    this.grow(4);
    this.buf.writeUInt32LE(v ? 1 : 0, this.pos);
    this.pos += 4;
  }

  writeInt16(v: number): void {
    this.align(2);
    this.grow(2);
    this.buf.writeInt16LE(v, this.pos);
    this.pos += 2;
  }

  writeUInt16(v: number): void {
    this.align(2);
    this.grow(2);
    this.buf.writeUInt16LE(v, this.pos);
    this.pos += 2;
  }

  writeInt32(v: number): void {
    this.align(4);
    this.grow(4);
    this.buf.writeInt32LE(v, this.pos);
    this.pos += 4;
  }

  writeUInt32(v: number): void {
    this.align(4);
    this.grow(4);
    this.buf.writeUInt32LE(v, this.pos);
    this.pos += 4;
  }

  writeInt64(v: bigint): void {
    this.align(8);
    this.grow(8);
    this.buf.writeBigInt64LE(v, this.pos);
    this.pos += 8;
  }

  writeUInt64(v: bigint): void {
    this.align(8);
    this.grow(8);
    this.buf.writeBigUInt64LE(v, this.pos);
    this.pos += 8;
  }

  writeDouble(v: number): void {
    this.align(8);
    this.grow(8);
    this.buf.writeDoubleLE(v, this.pos);
    this.pos += 8;
  }

  writeString(v: string): void {
    const bytes = Buffer.from(v, "utf8");
    this.align(4);
    this.grow(4 + bytes.length + 1);
    this.buf.writeUInt32LE(bytes.length, this.pos);
    this.pos += 4;
    bytes.copy(this.buf, this.pos);
    this.pos += bytes.length;
    this.buf[this.pos++] = 0;
  }

  writeObjectPath(v: string): void {
    this.writeString(v);
  }

  writeSignature(v: string): void {
    const bytes = Buffer.from(v, "utf8");
    this.grow(1 + bytes.length + 1);
    this.buf[this.pos++] = bytes.length;
    bytes.copy(this.buf, this.pos);
    this.pos += bytes.length;
    this.buf[this.pos++] = 0;
  }

  writeVariant(sig: string, value: any): void {
    this.writeSignature(sig);
    this.marshalValue(sig, value);
  }

  marshalValue(type: string, value: any): void {
    switch (type[0]) {
      case "y": this.writeByte(value); break;
      case "b": this.writeBoolean(value); break;
      case "n": this.writeInt16(value); break;
      case "q": this.writeUInt16(value); break;
      case "i": this.writeInt32(value); break;
      case "u": this.writeUInt32(value); break;
      case "x": this.writeInt64(value); break;
      case "t": this.writeUInt64(value); break;
      case "d": this.writeDouble(value); break;
      case "s": this.writeString(value); break;
      case "o": this.writeObjectPath(value); break;
      case "g": this.writeSignature(value); break;
      case "h": this.writeUInt32(value); break;
      case "v": {
        const [vsig, vval] = value as [string, any];
        this.writeVariant(vsig, vval);
        break;
      }
      case "a": {
        if (type[1] === "{") {
          this.marshalDict(type, value);
        } else {
          this.marshalArray(type, value);
        }
        break;
      }
      case "(": {
        this.marshalStruct(type, value);
        break;
      }
      default:
        throw new Error(`cannot marshal type: ${type}`);
    }
  }

  private marshalArray(type: string, values: any[]): void {
    const [elementType] = parseSingleType(type, 1);
    this.align(4);
    const lenPos = this.pos;
    this.pos += 4;
    this.align(alignOf(elementType[0]));
    const dataStart = this.pos;
    for (const v of values) {
      this.marshalValue(elementType, v);
    }
    this.buf.writeUInt32LE(this.pos - dataStart, lenPos);
  }

  private marshalDict(type: string, entries: Map<any, any> | Record<string, any>): void {
    const [entryType] = parseSingleType(type, 1);
    const [keyType, kEnd] = parseSingleType(entryType, 1);
    const [valType] = parseSingleType(entryType, kEnd);
    const iter = entries instanceof Map ? entries.entries() :
      Object.entries(entries);
    this.align(4);
    const lenPos = this.pos;
    this.pos += 4;
    this.align(8);
    const dataStart = this.pos;
    for (const [k, v] of iter) {
      this.align(8);
      this.marshalValue(keyType, k);
      this.marshalValue(valType, v);
    }
    this.buf.writeUInt32LE(this.pos - dataStart, lenPos);
  }

  private marshalStruct(type: string, values: any[]): void {
    this.align(8);
    const fields = parseSignature(type.slice(1, -1));
    for (let i = 0; i < fields.length; i++) {
      this.marshalValue(fields[i], values[i]);
    }
  }

  result(): Buffer {
    return this.buf.subarray(0, this.pos);
  }
}

// ─── Unmarshal (read) ──────────────────────────────────────────────

export class UnmarshalReader {
  readonly buf: Buffer;
  pos: number;

  constructor(buf: Buffer, offset = 0) {
    this.buf = buf;
    this.pos = offset;
  }

  align(n: number): void {
    this.pos = pad(this.pos, n);
  }

  readByte(): number {
    return this.buf[this.pos++];
  }

  readBoolean(): boolean {
    this.align(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v !== 0;
  }

  readInt16(): number {
    this.align(2);
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  readUInt16(): number {
    this.align(2);
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  readInt32(): number {
    this.align(4);
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readUInt32(): number {
    this.align(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readInt64(): bigint {
    this.align(8);
    const v = this.buf.readBigInt64LE(this.pos);
    this.pos += 8;
    return v;
  }

  readUInt64(): bigint {
    this.align(8);
    const v = this.buf.readBigUInt64LE(this.pos);
    this.pos += 8;
    return v;
  }

  readDouble(): number {
    this.align(8);
    const v = this.buf.readDoubleLE(this.pos);
    this.pos += 8;
    return v;
  }

  readString(): string {
    this.align(4);
    const len = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    const s = this.buf.toString("utf8", this.pos, this.pos + len);
    this.pos += len + 1; // skip NUL
    return s;
  }

  readObjectPath(): string {
    return this.readString();
  }

  readSignature(): string {
    const len = this.buf[this.pos++];
    const s = this.buf.toString("utf8", this.pos, this.pos + len);
    this.pos += len + 1; // skip NUL
    return s;
  }

  unmarshalValue(type: string): any {
    switch (type[0]) {
      case "y": return this.readByte();
      case "b": return this.readBoolean();
      case "n": return this.readInt16();
      case "q": return this.readUInt16();
      case "i": return this.readInt32();
      case "u": return this.readUInt32();
      case "x": return this.readInt64();
      case "t": return this.readUInt64();
      case "d": return this.readDouble();
      case "s": return this.readString();
      case "o": return this.readObjectPath();
      case "g": return this.readSignature();
      case "h": return this.readUInt32();
      case "v": return this.unmarshalVariant();
      case "a": {
        if (type[1] === "{") return this.unmarshalDict(type);
        return this.unmarshalArray(type);
      }
      case "(": return this.unmarshalStruct(type);
      default:
        throw new Error(`cannot unmarshal type: ${type}`);
    }
  }

  private unmarshalVariant(): any {
    const sig = this.readSignature();
    return this.unmarshalValue(sig);
  }

  private unmarshalArray(type: string): any[] {
    const [elementType] = parseSingleType(type, 1);
    this.align(4);
    const len = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    this.align(alignOf(elementType[0]));
    const end = this.pos + len;
    const arr: any[] = [];
    while (this.pos < end) {
      arr.push(this.unmarshalValue(elementType));
    }
    return arr;
  }

  private unmarshalDict(type: string): Map<any, any> {
    const [entryType] = parseSingleType(type, 1);
    const [keyType, kEnd] = parseSingleType(entryType, 1);
    const [valType] = parseSingleType(entryType, kEnd);
    this.align(4);
    const len = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    this.align(8);
    const end = this.pos + len;
    const map = new Map<any, any>();
    while (this.pos < end) {
      this.align(8);
      const k = this.unmarshalValue(keyType);
      const v = this.unmarshalValue(valType);
      map.set(k, v);
    }
    return map;
  }

  private unmarshalStruct(type: string): any[] {
    this.align(8);
    const fields = parseSignature(type.slice(1, -1));
    return fields.map(f => this.unmarshalValue(f));
  }
}

// ─── Message construction ──────────────────────────────────────────

export interface MessageHeader {
  type: number;
  flags: number;
  serial: number;
  path?: string;
  interface?: string;
  member?: string;
  errorName?: string;
  replySerial?: number;
  destination?: string;
  sender?: string;
  signature?: string;
  unixFds?: number;
}

export interface Message extends MessageHeader {
  body: any[];
}

export function encodeMessage(msg: Message): Buffer {
  const body = new MarshalBuffer(256);
  if (msg.signature) {
    const types = parseSignature(msg.signature);
    for (let i = 0; i < types.length; i++) {
      body.marshalValue(types[i], msg.body[i]);
    }
  }
  const bodyBytes = body.result();

  const hdr = new MarshalBuffer(128);

  // Fixed header
  hdr.writeByte(0x6c); // little-endian
  hdr.writeByte(msg.type);
  hdr.writeByte(msg.flags);
  hdr.writeByte(PROTO_VERSION);
  hdr.writeUInt32(bodyBytes.length);
  hdr.writeUInt32(msg.serial);

  // Header fields array
  const fields: [number, string, any][] = [];
  if (msg.path) fields.push([HDR_PATH, "o", msg.path]);
  if (msg.interface) fields.push([HDR_INTERFACE, "s", msg.interface]);
  if (msg.member) fields.push([HDR_MEMBER, "s", msg.member]);
  if (msg.errorName) fields.push([HDR_ERROR_NAME, "s", msg.errorName]);
  if (msg.replySerial !== undefined) fields.push([HDR_REPLY_SERIAL, "u", msg.replySerial]);
  if (msg.destination) fields.push([HDR_DESTINATION, "s", msg.destination]);
  if (msg.sender) fields.push([HDR_SENDER, "s", msg.sender]);
  if (msg.signature) fields.push([HDR_SIGNATURE, "g", msg.signature]);
  if (msg.unixFds !== undefined) fields.push([HDR_UNIX_FDS, "u", msg.unixFds]);

  // Manually encode header fields array: a(yv)
  const arrBuf = new MarshalBuffer(128);
  for (const [code, sig, val] of fields) {
    arrBuf.align(8);
    arrBuf.writeByte(code);
    arrBuf.writeVariant(sig, val);
  }
  const arrBytes = arrBuf.result();

  hdr.writeUInt32(arrBytes.length);
  hdr.grow(arrBytes.length);
  arrBytes.copy(hdr.buf, hdr.pos);
  hdr.pos += arrBytes.length;

  // Pad to 8-byte alignment before body
  hdr.align(8);

  const result = Buffer.alloc(hdr.pos + bodyBytes.length);
  hdr.buf.copy(result, 0, 0, hdr.pos);
  bodyBytes.copy(result, hdr.pos);
  return result;
}

export function decodeMessageHeader(buf: Buffer): { header: MessageHeader; bodyOffset: number; bodyLength: number } | null {
  if (buf.length < 16) return null;

  const endian = buf[0];
  if (endian !== 0x6c && endian !== 0x42) return null;
  const le = endian === 0x6c;

  const type = buf[1];
  const flags = buf[2];
  const bodyLength = le ? buf.readUInt32LE(4) : buf.readUInt32BE(4);
  const serial = le ? buf.readUInt32LE(8) : buf.readUInt32BE(8);

  // Header fields array length
  const fieldsLen = le ? buf.readUInt32LE(12) : buf.readUInt32BE(12);
  const fieldsStart = 16;
  const fieldsEnd = fieldsStart + fieldsLen;
  const bodyOffset = pad(fieldsEnd, 8);

  if (buf.length < bodyOffset + bodyLength) return null;

  const header: MessageHeader = { type, flags, serial };

  // Parse header fields
  const r = new UnmarshalReader(buf, fieldsStart);
  while (r.pos < fieldsEnd) {
    r.align(8);
    if (r.pos >= fieldsEnd) break;
    const code = r.readByte();
    const sig = r.readSignature();
    const val = r.unmarshalValue(sig);
    switch (code) {
      case HDR_PATH: header.path = val; break;
      case HDR_INTERFACE: header.interface = val; break;
      case HDR_MEMBER: header.member = val; break;
      case HDR_ERROR_NAME: header.errorName = val; break;
      case HDR_REPLY_SERIAL: header.replySerial = val; break;
      case HDR_DESTINATION: header.destination = val; break;
      case HDR_SENDER: header.sender = val; break;
      case HDR_SIGNATURE: header.signature = val; break;
      case HDR_UNIX_FDS: header.unixFds = val; break;
    }
  }

  return { header, bodyOffset, bodyLength };
}

export function decodeMessage(buf: Buffer): Message | null {
  const decoded = decodeMessageHeader(buf);
  if (!decoded) return null;
  const { header, bodyOffset, bodyLength } = decoded;

  const body: any[] = [];
  if (header.signature && bodyLength > 0) {
    const r = new UnmarshalReader(buf, bodyOffset);
    const types = parseSignature(header.signature);
    for (const t of types) {
      body.push(r.unmarshalValue(t));
    }
  }

  return { ...header, body };
}

export function totalMessageLength(buf: Buffer): number | null {
  if (buf.length < 16) return null;
  const le = buf[0] === 0x6c;
  const bodyLength = le ? buf.readUInt32LE(4) : buf.readUInt32BE(4);
  const fieldsLen = le ? buf.readUInt32LE(12) : buf.readUInt32BE(12);
  return pad(16 + fieldsLen, 8) + bodyLength;
}
