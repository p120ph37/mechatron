import { Bounds } from "./Bounds";
import { Point } from "./Point";
export declare class Window {
    private _handle;
    constructor(handle?: number | Window);
    isValid(): boolean;
    close(): void;
    isTopMost(): boolean;
    isBorderless(): boolean;
    isMinimized(): boolean;
    isMaximized(): boolean;
    setTopMost(topMost: boolean): void;
    setBorderless(borderless: boolean): void;
    setMinimized(minimized: boolean): void;
    setMaximized(maximized: boolean): void;
    getProcess(): any;
    getPID(): number;
    getHandle(): number;
    setHandle(handle: number): boolean;
    getTitle(): string;
    setTitle(title: string): void;
    getBounds(): Bounds;
    setBounds(): void;
    setBounds(bounds: Bounds | {
        x: number;
        y: number;
        w: number;
        h: number;
    }): void;
    setBounds(x: number, y: number, w: number, h: number): void;
    getClient(): Bounds;
    setClient(): void;
    setClient(bounds: Bounds | {
        x: number;
        y: number;
        w: number;
        h: number;
    }): void;
    setClient(x: number, y: number, w: number, h: number): void;
    mapToClient(): Point;
    mapToClient(point: Point | {
        x: number;
        y: number;
    }): Point;
    mapToClient(x: number, y: number): Point;
    mapToScreen(): Point;
    mapToScreen(point: Point | {
        x: number;
        y: number;
    }): Point;
    mapToScreen(x: number, y: number): Point;
    eq(other: Window | number): boolean;
    ne(other: Window | number): boolean;
    clone(): Window;
    static getList(title?: string): Window[];
    static getActive(): Window;
    static setActive(window: Window): void;
    static isAxEnabled(prompt?: boolean): boolean;
}
