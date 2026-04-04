import { Window } from "./Window";
export interface ModuleData {
    valid: boolean;
    name: string;
    path: string;
    base: number;
    size: number;
    pid: number;
}
export declare class Process {
    private _pid;
    constructor(pid?: number | Process);
    open(pid: number): boolean;
    close(): void;
    isValid(): boolean;
    is64Bit(): boolean;
    isDebugged(): boolean;
    getPID(): number;
    getHandle(): number;
    getName(): string;
    getPath(): string;
    exit(): void;
    kill(): void;
    hasExited(): boolean;
    getModules(regex?: string): ModuleData[];
    getWindows(regex?: string): Window[];
    eq(other: Process | number): boolean;
    ne(other: Process | number): boolean;
    clone(): Process;
    static getList(regex?: string): Process[];
    static getCurrent(): Process;
    static isSys64Bit(): boolean;
    static _getSegments(process: Process, base: number): Array<{
        valid: boolean;
        base: number;
        size: number;
        name: string;
    }>;
}
