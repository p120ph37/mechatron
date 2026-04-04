import { Point } from "./Point";
import { Size } from "./Size";
export declare class Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
    constructor();
    constructor(other: Bounds);
    constructor(value: number);
    constructor(x: number, y: number, w: number, h: number);
    constructor(point: Point, size: Size);
    constructor(obj: {
        x: number;
        y: number;
        w: number;
        h: number;
    });
    constructor(obj: {
        l: number;
        t: number;
        r: number;
        b: number;
    });
    isZero(): boolean;
    isEmpty(): boolean;
    isValid(): boolean;
    getLeft(): number;
    getTop(): number;
    getRight(): number;
    getBottom(): number;
    setLeft(l: number): void;
    setTop(t: number): void;
    setRight(r: number): void;
    setBottom(b: number): void;
    getLTRB(): {
        l: number;
        t: number;
        r: number;
        b: number;
    };
    setLTRB(l: number, t: number, r: number, b: number): void;
    normalize(): void;
    private static _norm;
    containsP(...args: any[]): boolean;
    containsB(...args: any[]): boolean;
    intersects(...args: any[]): boolean;
    getPoint(): Point;
    setPoint(p?: Point | {
        x: number;
        y: number;
    } | number, y?: number): void;
    getSize(): Size;
    setSize(s?: Size | {
        w: number;
        h: number;
    } | number, h?: number): void;
    getCenter(): Point;
    unite(...args: any[]): Bounds;
    intersect(...args: any[]): Bounds;
    eq(...args: any[]): boolean;
    ne(...args: any[]): boolean;
    clone(): Bounds;
    toString(): string;
    static normalize(...args: any[]): {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    /** @internal */
    static _validateArgs(args: any[]): void;
    /** @internal */
    static _resolveArgs(args: any[]): {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}
