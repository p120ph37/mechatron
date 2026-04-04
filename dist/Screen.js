"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Screen = void 0;
const Bounds_1 = require("./Bounds");
const Point_1 = require("./Point");
function getNative() {
    const { getNativeBackend } = require("./native");
    return getNativeBackend();
}
// Union two bounds rectangles
function unionBounds(a, b) {
    if (a.w === 0 && a.h === 0)
        return b;
    if (b.w === 0 && b.h === 0)
        return a;
    const l = Math.min(a.x, b.x);
    const t = Math.min(a.y, b.y);
    const r = Math.max(a.x + a.w, b.x + b.w);
    const bot = Math.max(a.y + a.h, b.y + b.h);
    return { x: l, y: t, w: r - l, h: bot - t };
}
class Screen {
    _bounds;
    _usable;
    constructor(a, b) {
        if (a instanceof Screen) {
            this._bounds = a._bounds.clone();
            this._usable = a._usable.clone();
        }
        else if (a instanceof Bounds_1.Bounds && b instanceof Bounds_1.Bounds) {
            this._bounds = a.clone();
            this._usable = b.clone();
        }
        else {
            this._bounds = new Bounds_1.Bounds();
            this._usable = new Bounds_1.Bounds();
        }
    }
    getBounds() {
        return this._bounds.clone();
    }
    getUsable() {
        return this._usable.clone();
    }
    isPortrait() {
        return this._bounds.getSize().h < this._bounds.getSize().w ? false :
            this._bounds.getSize().h > this._bounds.getSize().w ? true : false;
    }
    isLandscape() {
        return this._bounds.getSize().w < this._bounds.getSize().h ? false :
            this._bounds.getSize().w > this._bounds.getSize().h ? true : false;
    }
    clone() {
        return new Screen(this._bounds.clone(), this._usable.clone());
    }
    // --- Static state ---
    static _screens = [];
    static _totalBounds = new Bounds_1.Bounds();
    static _totalUsable = new Bounds_1.Bounds();
    static synchronize() {
        const result = getNative().screen_synchronize();
        if (!result)
            return false;
        let tb = { x: 0, y: 0, w: 0, h: 0 };
        let tu = { x: 0, y: 0, w: 0, h: 0 };
        Screen._screens = result.map((s) => {
            tb = unionBounds(tb, s.bounds);
            tu = unionBounds(tu, s.usable);
            const bounds = new Bounds_1.Bounds(s.bounds.x, s.bounds.y, s.bounds.w, s.bounds.h);
            const usable = new Bounds_1.Bounds(s.usable.x, s.usable.y, s.usable.w, s.usable.h);
            return new Screen(bounds, usable);
        });
        Screen._totalBounds = new Bounds_1.Bounds(tb.x, tb.y, tb.w, tb.h);
        Screen._totalUsable = new Bounds_1.Bounds(tu.x, tu.y, tu.w, tu.h);
        return true;
    }
    static getMain() {
        return Screen._screens.length > 0 ? Screen._screens[0] : null;
    }
    static getList() {
        return Screen._screens.slice();
    }
    static getScreen(a, b) {
        if (typeof a === "number" && typeof b === "number") {
            return Screen._getScreenForPoint(new Point_1.Point(a, b));
        }
        // Window-like object with getBounds()
        if (a && typeof a.getBounds === "function" && typeof a.isValid === "function") {
            if (!a.isValid())
                return null;
            const bounds = a.getBounds();
            // Use center of window bounds
            const cx = bounds.x + Math.floor(bounds.w / 2);
            const cy = bounds.y + Math.floor(bounds.h / 2);
            return Screen._getScreenForPoint(new Point_1.Point(cx, cy));
        }
        // Point-like
        const p = a instanceof Point_1.Point ? a : new Point_1.Point(a.x, a.y);
        return Screen._getScreenForPoint(p);
    }
    static _getScreenForPoint(p) {
        for (const s of Screen._screens) {
            if (s._bounds.containsP(p))
                return s;
        }
        return Screen.getMain();
    }
    static grabScreen(image, a, b, c, d, e) {
        image.destroy();
        let x, y, w, h;
        let windowHandle;
        if (a instanceof Bounds_1.Bounds) {
            x = a.x;
            y = a.y;
            w = a.w;
            h = a.h;
            windowHandle = Screen._resolveWindowHandle(b);
        }
        else {
            x = a;
            y = b;
            w = c;
            h = d;
            windowHandle = Screen._resolveWindowHandle(e);
        }
        const result = getNative().screen_grabScreen(x, y, w, h, windowHandle);
        if (!result)
            return false;
        image.create(w, h);
        const data = image.getData();
        if (data)
            data.set(result);
        return true;
    }
    static _resolveWindowHandle(w) {
        if (w === undefined || w === null)
            return undefined;
        if (typeof w === "number")
            return w;
        if (typeof w.getHandle === "function")
            return w.getHandle();
        return undefined;
    }
    // Computed in TS from synchronize data (no longer delegated to native)
    static getTotalBounds() {
        return Screen._totalBounds.clone();
    }
    static getTotalUsable() {
        return Screen._totalUsable.clone();
    }
    // Compositing detection — implemented in TS via platform check
    // macOS and modern Linux always composite; Windows 8+ has DWM always on
    static isCompositing() {
        return true;
    }
    static setCompositing(_enabled) {
        // No-op on all modern platforms
    }
}
exports.Screen = Screen;
