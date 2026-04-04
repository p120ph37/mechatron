import { Point } from "./Point";
export declare class Size {
    w: number;
    h: number;
    constructor();
    constructor(other: Size);
    constructor(value: number);
    constructor(w: number, h: number);
    constructor(obj: {
        w: number;
        h: number;
    });
    isZero(): boolean;
    isEmpty(): boolean;
    toPoint(): Point;
    add(other: Size | {
        w: number;
        h: number;
    } | number, b?: number): Size;
    sub(other: Size | {
        w: number;
        h: number;
    } | number, b?: number): Size;
    eq(...args: any[]): boolean;
    ne(...args: any[]): boolean;
    clone(): Size;
    toString(): string;
    static normalize(a?: number | Size | {
        w: number;
        h: number;
    }, b?: number): {
        w: number;
        h: number;
    };
    /** @internal */
    static _resolve(a: Size | {
        w: number;
        h: number;
    } | number | undefined, b?: number): {
        w: number;
        h: number;
    };
}
