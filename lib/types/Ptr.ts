export class Ptr {
  readonly value: bigint;

  static readonly NULL = new Ptr(0n);

  constructor(v?: bigint | number | Ptr) {
    if (v === undefined || v === null) {
      this.value = 0n;
    } else if (v instanceof Ptr) {
      this.value = v.value;
    } else if (typeof v === "bigint") {
      this.value = v;
    } else {
      this.value = BigInt(v);
    }
  }

  isNull(): boolean { return this.value === 0n; }

  add(offset: number | bigint | Ptr): Ptr {
    const n = offset instanceof Ptr ? offset.value : BigInt(offset);
    return new Ptr(this.value + n);
  }

  sub(offset: number | bigint | Ptr): Ptr {
    const n = offset instanceof Ptr ? offset.value : BigInt(offset);
    return new Ptr(this.value - n);
  }

  eq(other: Ptr | bigint | number): boolean {
    if (other instanceof Ptr) return this.value === other.value;
    return this.value === BigInt(other);
  }

  ne(other: Ptr | bigint | number): boolean { return !this.eq(other); }

  lt(other: Ptr | bigint | number): boolean {
    if (other instanceof Ptr) return this.value < other.value;
    return this.value < BigInt(other);
  }

  gt(other: Ptr | bigint | number): boolean {
    if (other instanceof Ptr) return this.value > other.value;
    return this.value > BigInt(other);
  }

  le(other: Ptr | bigint | number): boolean {
    if (other instanceof Ptr) return this.value <= other.value;
    return this.value <= BigInt(other);
  }

  ge(other: Ptr | bigint | number): boolean {
    if (other instanceof Ptr) return this.value >= other.value;
    return this.value >= BigInt(other);
  }

  toNumber(): number { return Number(this.value); }

  toBigInt(): bigint { return this.value; }

  toString(): string {
    return "0x" + this.value.toString(16).toUpperCase();
  }

  toJSON(): string { return this.toString(); }

  [Symbol.toPrimitive](hint: string): bigint | string {
    if (hint === "string") return this.toString();
    return this.value;
  }

  valueOf(): bigint { return this.value; }

  static from(v: bigint | number | Ptr | undefined | null): Ptr {
    if (v instanceof Ptr) return v;
    return new Ptr(v ?? 0n);
  }

  static compare(a: Ptr, b: Ptr): number {
    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return 0;
  }
}
