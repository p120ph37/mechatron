export declare class Color {
    a: number;
    r: number;
    g: number;
    b: number;
    constructor();
    constructor(other: Color);
    constructor(argb: number);
    constructor(r: number, g: number, b: number, a?: number);
    constructor(obj: {
        r: number;
        g: number;
        b: number;
        a?: number;
    });
    getARGB(): number;
    setARGB(argb: number): void;
    eq(...args: any[]): boolean;
    ne(...args: any[]): boolean;
    clone(): Color;
    toString(): string;
    static normalize(...args: any[]): {
        r: number;
        g: number;
        b: number;
        a: number;
    };
    /** @internal */
    static _resolve(args: any[]): {
        a: number;
        r: number;
        g: number;
        b: number;
    };
}
