import { Window } from "./Window";
import type { NativeBackend } from "./native";

function getNative(): NativeBackend {
  const { getNativeBackend } = require("./native");
  return getNativeBackend();
}

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
    const valid = getNative().process_open(pid);
    this._pid = valid ? pid : 0;
    return valid;
  }

  close(): void {
    getNative().process_close(this._pid);
    this._pid = 0;
  }

  isValid(): boolean {
    return getNative().process_isValid(this._pid);
  }

  is64Bit(): boolean {
    return getNative().process_is64Bit(this._pid);
  }

  isDebugged(): boolean {
    return getNative().process_isDebugged(this._pid);
  }

  getPID(): number {
    return this._pid;
  }

  getName(): string {
    return getNative().process_getName(this._pid);
  }

  getPath(): string {
    return getNative().process_getPath(this._pid);
  }

  exit(): void {
    getNative().process_exit(this._pid);
  }

  kill(): void {
    getNative().process_kill(this._pid);
  }

  hasExited(): boolean {
    return getNative().process_hasExited(this._pid);
  }

  getModules(regex?: string): ModuleData[] {
    return getNative().process_getModules(this._pid, regex);
  }

  getWindows(regex?: string): Window[] {
    const handles = getNative().process_getWindows(this._pid, regex);
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
    const pids = getNative().process_getList(regex);
    return pids.map((pid) => new Process(pid));
  }

  static getCurrent(): Process {
    return new Process(getNative().process_getCurrent());
  }

  static isSys64Bit(): boolean {
    return getNative().process_isSys64Bit();
  }

  static _getSegments(process: Process, base: number): Array<{ valid: boolean; base: number; size: number; name: string }> {
    return getNative().process_getSegments(process._pid, base);
  }
}
