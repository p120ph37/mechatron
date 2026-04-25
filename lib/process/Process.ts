import { getNative } from "../backend";
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

  async open(pid: number): Promise<boolean> {
    const valid = getNative("process").process_open(pid);
    this._pid = valid ? pid : 0;
    return valid;
  }

  async close(): Promise<void> {
    getNative("process").process_close(this._pid);
    this._pid = 0;
  }

  async isValid(): Promise<boolean> {
    return getNative("process").process_isValid(this._pid);
  }

  async is64Bit(): Promise<boolean> {
    return getNative("process").process_is64Bit(this._pid);
  }

  async isDebugged(): Promise<boolean> {
    return getNative("process").process_isDebugged(this._pid);
  }

  getPID(): number {
    return this._pid;
  }

  async getHandle(): Promise<number> {
    const native = getNative("process");
    if (typeof native.process_getHandle === "function") {
      return native.process_getHandle(this._pid);
    }
    return 0;
  }

  async getName(): Promise<string> {
    return getNative("process").process_getName(this._pid);
  }

  async getPath(): Promise<string> {
    return getNative("process").process_getPath(this._pid);
  }

  async exit(): Promise<void> {
    getNative("process").process_exit(this._pid);
  }

  async kill(): Promise<void> {
    getNative("process").process_kill(this._pid);
  }

  async hasExited(): Promise<boolean> {
    return getNative("process").process_hasExited(this._pid);
  }

  async getModules(regex?: string): Promise<Module[]> {
    const { Module: ModuleClass } = require("./Module") as typeof import("./Module");
    const raw: ModuleData[] = getNative("process").process_getModules(this._pid, regex);
    return raw.map((data) => {
      const mod = new ModuleClass(data);
      mod._segments = null;
      mod._proc = this;
      return mod;
    });
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

  static async getList(regex?: string): Promise<Process[]> {
    const pids: number[] = getNative("process").process_getList(regex);
    return pids.map((pid) => new Process(pid));
  }

  static async getCurrent(): Promise<Process> {
    return new Process(getNative("process").process_getCurrent());
  }

  static async isSys64Bit(): Promise<boolean> {
    return getNative("process").process_isSys64Bit();
  }

  static _getSegments(process: Process, base: number): Array<{ valid: boolean; base: number; size: number; name: string }> {
    return getNative("process").process_getSegments(process._pid, base);
  }
}
