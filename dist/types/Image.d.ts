import { Color } from "./Color";
import { Point } from "./Point";
export declare class Image {
    private _width;
    private _height;
    private _length;
    private _data;
    private _limit;
    constructor();
    constructor(other: Image);
    constructor(size: number);
    constructor(w: number, h: number);
    isValid(): boolean;
    create(size: number): boolean;
    create(w: number, h: number): boolean;
    destroy(): void;
    getWidth(): number;
    getHeight(): number;
    getLength(): number;
    getLimit(): number;
    getData(): Uint32Array | null;
    getPixel(point: Point): Color;
    getPixel(index: number): Color;
    getPixel(x: number, y: number): Color;
    private _getPixelXY;
    setPixel(x: number, y: number, c: Color): void;
    setPixel(p: Point, c: Color): void;
    setPixel(index: number, c: Color): void;
    private _setPixelXY;
    fill(...args: any[]): boolean;
    swap(sw: string): boolean;
    flip(h: boolean, v: boolean): boolean;
    private _flipBoth;
    private _flipH;
    private _flipV;
    eq(other: Image): boolean;
    ne(other: Image): boolean;
    clone(): Image;
    toString(): string;
}
declare module "./Color" {
    interface Color {
    }
    namespace Color {
        function _fromARGB(argb: number): Color;
    }
}
