import { Window } from "../window";
import { getNative } from "../napi";
import type { Module } from "./Module";

export interface ModuleData {
  valid: boolean;
  name: string;
  path: string;
  base: number;
  size: number;
  pid: number;
}

export class Process {
  private _pid: number;

  constructor(pid?: number | Process) {
    if (pid instanceof Process) {
      this._pid = pid._pid;
    } else {
      this._pid = (typeof pid === "number") ? pid : 0;
    }
  }

  open(pid: number): boolean {
    const valid = getNative("process").process_open(pid);
    this._pid = valid ? pid : 0;
    return valid;
  }

  close(): void {
    getNative("process").process_close(this._pid);
    this._pid = 0;
  }

  isValid(): boolean {
    return getNative("process").process_isValid(this._pid);
  }

  is64Bit(): boolean {
    return getNative("process").process_is64Bit(this._pid);
  }

  isDebugged(): boolean {
    return getNative("process").process_isDebugged(this._pid);
  }

  getPID(): number {
    return this._pid;
  }

  getHandle(): number {
    const native = getNative("process");
    if (typeof native.process_getHandle === "function") {
      return native.process_getHandle(this._pid);
    }
    return 0;
  }

  getName(): string {
    return getNative("process").process_getName(this._pid);
  }

  getPath(): string {
    return getNative("process").process_getPath(this._pid);
  }

  exit(): void {
    getNative("process").process_exit(this._pid);
  }

  kill(): void {
    getNative("process").process_kill(this._pid);
  }

  hasExited(): boolean {
    return getNative("process").process_hasExited(this._pid);
  }

  getModules(regex?: string): Module[] {
    // Lazy require to avoid a cycle with Module (which imports Process).
    const { Module: ModuleClass } = require("./Module") as typeof import("./Module");
    const raw: ModuleData[] = getNative("process").process_getModules(this._pid, regex);
    return raw.map((data) => {
      const mod = new ModuleClass(data);
      mod._segments = null;
      mod._proc = this;
      return mod;
    });
  }

  async getModulesAsync(regex?: string): Promise<Module[]> {
    return new Promise((resolve) => queueMicrotask(() => resolve(this.getModules(regex))));
  }

  getWindows(regex?: string): Window[] {
    const handles: number[] = getNative("process").process_getWindows(this._pid, regex);
    return handles.map((h) => new Window(h));
  }

  eq(other: Process | number): boolean {
    if (other instanceof Process) {
      return this._pid === other._pid;
    }
    return this._pid === other;
  }

  ne(other: Process | number): boolean {
    return !this.eq(other);
  }

  clone(): Process {
    return new Process(this._pid);
  }

  static getList(regex?: string): Process[] {
    const pids: number[] = getNative("process").process_getList(regex);
    return pids.map((pid) => new Process(pid));
  }

  static async getListAsync(regex?: string): Promise<Process[]> {
    return new Promise((resolve) => queueMicrotask(() => resolve(Process.getList(regex))));
  }

  static getCurrent(): Process {
    return new Process(getNative("process").process_getCurrent());
  }

  static isSys64Bit(): boolean {
    return getNative("process").process_isSys64Bit();
  }

  static _getSegments(process: Process, base: number): Array<{ valid: boolean; base: number; size: number; name: string }> {
    return getNative("process").process_getSegments(process._pid, base);
  }
}
