import { Range } from "./Range";
import { Point } from "./Point";
export declare class Mouse {
    autoDelay: Range;
    private _native;
    constructor();
    constructor(other: Mouse);
    click(button: number): void;
    press(button: number): void;
    release(button: number): void;
    scrollH(amount: number): void;
    scrollV(amount: number): void;
    clone(): Mouse;
    static getPos(): Point;
    static setPos(p: Point | {
        x: number;
        y: number;
    } | number, y?: number): void;
    static getState(button?: number): Record<number, boolean> | boolean;
}
