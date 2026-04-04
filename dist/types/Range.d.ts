export declare class Range {
    min: number;
    max: number;
    private _state;
    constructor();
    constructor(other: Range);
    constructor(value: number);
    constructor(min: number, max: number);
    constructor(obj: {
        min: number;
        max: number;
    });
    getRange(): number;
    setRange(value: number): void;
    setRange(min: number, max: number): void;
    setRange(a: Range): void;
    contains(value: number, inclusive?: boolean): boolean;
    getRandom(): number;
    eq(other: Range): boolean;
    eq(other: {
        min: number;
        max: number;
    }): boolean;
    eq(value: number): boolean;
    eq(min: number, max: number): boolean;
    ne(...args: any[]): boolean;
    clone(): Range;
    toString(): string;
    static normalize(a?: number | Range | {
        min: number;
        max: number;
    }, b?: number): {
        min: number;
        max: number;
    };
}
