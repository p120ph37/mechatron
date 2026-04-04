"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Process = void 0;
const Window_1 = require("./Window");
function getNative() {
    const { getNativeBackend } = require("./native");
    return getNativeBackend();
}
class Process {
    _pid;
    constructor(pid) {
        if (pid instanceof Process) {
            this._pid = pid._pid;
        }
        else {
            this._pid = (typeof pid === "number") ? pid : 0;
        }
    }
    open(pid) {
        const valid = getNative().process_open(pid);
        this._pid = valid ? pid : 0;
        return valid;
    }
    close() {
        getNative().process_close(this._pid);
        this._pid = 0;
    }
    isValid() {
        return getNative().process_isValid(this._pid);
    }
    is64Bit() {
        return getNative().process_is64Bit(this._pid);
    }
    isDebugged() {
        return getNative().process_isDebugged(this._pid);
    }
    getPID() {
        return this._pid;
    }
    getHandle() {
        const native = getNative();
        if (typeof native.process_getHandle === "function") {
            return native.process_getHandle(this._pid);
        }
        return 0;
    }
    getName() {
        return getNative().process_getName(this._pid);
    }
    getPath() {
        return getNative().process_getPath(this._pid);
    }
    exit() {
        getNative().process_exit(this._pid);
    }
    kill() {
        getNative().process_kill(this._pid);
    }
    hasExited() {
        return getNative().process_hasExited(this._pid);
    }
    getModules(regex) {
        return getNative().process_getModules(this._pid, regex);
    }
    getWindows(regex) {
        const handles = getNative().process_getWindows(this._pid, regex);
        return handles.map((h) => new Window_1.Window(h));
    }
    eq(other) {
        if (other instanceof Process) {
            return this._pid === other._pid;
        }
        return this._pid === other;
    }
    ne(other) {
        return !this.eq(other);
    }
    clone() {
        return new Process(this._pid);
    }
    static getList(regex) {
        const pids = getNative().process_getList(regex);
        return pids.map((pid) => new Process(pid));
    }
    static getCurrent() {
        return new Process(getNative().process_getCurrent());
    }
    static isSys64Bit() {
        return getNative().process_isSys64Bit();
    }
    static _getSegments(process, base) {
        return getNative().process_getSegments(process._pid, base);
    }
}
exports.Process = Process;
