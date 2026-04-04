export declare class Hash {
    result: number;
    constructor();
    constructor(other: Hash);
    constructor(value: number);
    constructor(data: string | Buffer | Uint8Array | ArrayBuffer | number[]);
    append(data: any): void;
    eq(other: Hash | number): boolean;
    ne(other: Hash | number): boolean;
    clone(): Hash;
    toString(): string;
}
