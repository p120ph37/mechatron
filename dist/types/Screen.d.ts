import { Bounds } from "./Bounds";
import { Image } from "./Image";
import { Point } from "./Point";
export declare class Screen {
    private _bounds;
    private _usable;
    constructor();
    constructor(other: Screen);
    constructor(bounds: Bounds, usable: Bounds);
    getBounds(): Bounds;
    getUsable(): Bounds;
    isPortrait(): boolean;
    isLandscape(): boolean;
    clone(): Screen;
    private static _screens;
    private static _totalBounds;
    private static _totalUsable;
    static synchronize(): boolean;
    static getMain(): Screen | null;
    static getList(): Screen[];
    static getScreen(target: {
        x: number;
        y: number;
    } | Point): Screen | null;
    static getScreen(x: number, y: number): Screen | null;
    static getScreen(window: any): Screen | null;
    private static _getScreenForPoint;
    static grabScreen(image: Image, x: number, y: number, w: number, h: number, window?: any): boolean;
    static grabScreen(image: Image, bounds: Bounds, window?: any): boolean;
    private static _resolveWindowHandle;
    static getTotalBounds(): Bounds;
    static getTotalUsable(): Bounds;
    static isCompositing(): boolean;
    static setCompositing(_enabled: boolean): void;
}
