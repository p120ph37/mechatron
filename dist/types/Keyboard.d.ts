import { Range } from "./Range";
export declare class Keyboard {
    autoDelay: Range;
    private _native;
    constructor();
    constructor(other: Keyboard);
    click(key: number | string): void;
    press(key: number): void;
    release(key: number): void;
    clone(): Keyboard;
    static compile(keys: string): Array<{
        down: boolean;
        key: number;
    }>;
    static getState(keycode?: number): Record<number, boolean> | boolean;
}
