import { Range } from "./Range";
export declare class Timer {
    private _started;
    constructor();
    constructor(other: Timer);
    start(): void;
    reset(): number;
    restart(): number;
    getElapsed(): number;
    hasStarted(): boolean;
    hasExpired(time?: number): boolean;
    lt(other?: Timer): boolean;
    gt(other?: Timer): boolean;
    le(other?: Timer): boolean;
    ge(other?: Timer): boolean;
    eq(other?: Timer): boolean;
    ne(other?: Timer): boolean;
    clone(): Timer;
    static sleep(range: Range): void;
    static sleep(min: number, max?: number): void;
    static getCpuTime(): number;
    static compare(a: Timer, b: Timer): number;
}
