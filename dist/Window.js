"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Window = void 0;
const Bounds_1 = require("./Bounds");
const Point_1 = require("./Point");
function getNative() {
    const { getNativeBackend } = require("./native");
    return getNativeBackend();
}
class Window {
    _handle;
    constructor(handle) {
        if (handle instanceof Window) {
            this._handle = handle._handle;
        }
        else {
            this._handle = handle || 0;
        }
    }
    isValid() {
        return getNative().window_isValid(this._handle);
    }
    close() {
        getNative().window_close(this._handle);
    }
    isTopMost() {
        return getNative().window_isTopMost(this._handle);
    }
    isBorderless() {
        return getNative().window_isBorderless(this._handle);
    }
    isMinimized() {
        return getNative().window_isMinimized(this._handle);
    }
    isMaximized() {
        return getNative().window_isMaximized(this._handle);
    }
    setTopMost(topMost) {
        getNative().window_setTopMost(this._handle, topMost);
    }
    setBorderless(borderless) {
        getNative().window_setBorderless(this._handle, borderless);
    }
    setMinimized(minimized) {
        getNative().window_setMinimized(this._handle, minimized);
    }
    setMaximized(maximized) {
        getNative().window_setMaximized(this._handle, maximized);
    }
    getProcess() {
        const { Process } = require("./Process");
        return new Process(getNative().window_getProcess(this._handle));
    }
    getPID() {
        return getNative().window_getPID(this._handle);
    }
    getHandle() {
        return this._handle;
    }
    setHandle(handle) {
        const result = getNative().window_setHandle(this._handle, handle);
        if (result)
            this._handle = handle;
        return result;
    }
    getTitle() {
        return getNative().window_getTitle(this._handle);
    }
    setTitle(title) {
        getNative().window_setTitle(this._handle, title);
    }
    getBounds() {
        const b = getNative().window_getBounds(this._handle);
        return new Bounds_1.Bounds(b.x, b.y, b.w, b.h);
    }
    setBounds(a, b, c, d) {
        if (a === undefined) {
            getNative().window_setBounds(this._handle, 0, 0, 0, 0);
        }
        else if (typeof a === "number") {
            getNative().window_setBounds(this._handle, a, b, c, d);
        }
        else {
            getNative().window_setBounds(this._handle, a.x, a.y, a.w, a.h);
        }
    }
    getClient() {
        const b = getNative().window_getClient(this._handle);
        return new Bounds_1.Bounds(b.x, b.y, b.w, b.h);
    }
    setClient(a, b, c, d) {
        if (a === undefined) {
            getNative().window_setClient(this._handle, 0, 0, 0, 0);
        }
        else if (typeof a === "number") {
            getNative().window_setClient(this._handle, a, b, c, d);
        }
        else {
            getNative().window_setClient(this._handle, a.x, a.y, a.w, a.h);
        }
    }
    mapToClient(a, b) {
        let x, y;
        if (a === undefined) {
            x = 0;
            y = 0;
        }
        else if (typeof a === "number") {
            x = a;
            y = b !== undefined ? b : a;
        }
        else {
            x = a.x;
            y = a.y;
        }
        const p = getNative().window_mapToClient(this._handle, x, y);
        return new Point_1.Point(p.x, p.y);
    }
    mapToScreen(a, b) {
        let x, y;
        if (a === undefined) {
            x = 0;
            y = 0;
        }
        else if (typeof a === "number") {
            x = a;
            y = b !== undefined ? b : a;
        }
        else {
            x = a.x;
            y = a.y;
        }
        const p = getNative().window_mapToScreen(this._handle, x, y);
        return new Point_1.Point(p.x, p.y);
    }
    eq(other) {
        if (other instanceof Window) {
            return this._handle === other._handle;
        }
        return this._handle === other;
    }
    ne(other) {
        return !this.eq(other);
    }
    clone() {
        return new Window(this._handle);
    }
    static getList(title) {
        const handles = getNative().window_getList(title);
        return handles.map((h) => new Window(h));
    }
    static getActive() {
        return new Window(getNative().window_getActive());
    }
    static setActive(window) {
        getNative().window_setActive(window._handle);
    }
    static isAxEnabled(prompt) {
        return getNative().window_isAxEnabled(prompt);
    }
}
exports.Window = Window;
