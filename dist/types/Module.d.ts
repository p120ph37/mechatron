import { Process } from "./Process";
import type { ModuleData } from "./Process";
export declare class Segment {
    valid: boolean;
    base: number;
    size: number;
    name: string;
    constructor();
    contains(value: number): boolean;
    lt(value: Segment | number): boolean;
    gt(value: Segment | number): boolean;
    le(value: Segment | number): boolean;
    ge(value: Segment | number): boolean;
    eq(segment: Segment): boolean;
    ne(segment: Segment): boolean;
    clone(): Segment;
    static compare(a: Segment, b: Segment): number;
}
export declare class Module {
    valid: boolean;
    name: string;
    path: string;
    base: number;
    size: number;
    process: Process;
    _segments: Segment[] | null;
    _proc: Process | null;
    constructor();
    constructor(other: Module);
    constructor(data: ModuleData);
    constructor(process: Process, name: string, path: string, base: number, size: number);
    isValid(): boolean;
    getName(): string;
    getPath(): string;
    getBase(): number;
    getSize(): number;
    getProcess(): Process;
    contains(address: number): boolean;
    lt(value: Module | number): boolean;
    gt(value: Module | number): boolean;
    le(value: Module | number): boolean;
    ge(value: Module | number): boolean;
    eq(value: Module | number): boolean;
    ne(value: Module | number): boolean;
    getSegments(): Segment[];
    clone(): Module;
    static compare(a: Module, b: Module): number;
}
