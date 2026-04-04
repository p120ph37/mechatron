import { Size } from "./Size";
export declare class Point {
    x: number;
    y: number;
    constructor();
    constructor(other: Point);
    constructor(value: number);
    constructor(x: number, y: number);
    constructor(obj: {
        x: number;
        y: number;
    });
    isZero(): boolean;
    toSize(): Size;
    add(other: Point | {
        x: number;
        y: number;
    } | number, b?: number): Point;
    sub(other: Point | {
        x: number;
        y: number;
    } | number, b?: number): Point;
    neg(): Point;
    eq(...args: any[]): boolean;
    ne(...args: any[]): boolean;
    clone(): Point;
    toString(): string;
    static normalize(a?: number | Point | {
        x: number;
        y: number;
    }, b?: number): {
        x: number;
        y: number;
    };
    /** @internal */
    static _resolve(a: Point | {
        x: number;
        y: number;
    } | number | undefined, b?: number): {
        x: number;
        y: number;
    };
}
