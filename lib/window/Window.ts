import { Bounds } from "../types";
import { Point } from "../types";
import { getNative } from "../backend";

export class Window {
  private _handle: number;

  constructor(handle?: number | Window) {
    if (handle instanceof Window) {
      this._handle = handle._handle;
    } else {
      this._handle = handle || 0;
    }
  }

  async isValid(): Promise<boolean> {
    return await getNative("window").window_isValid(this._handle);
  }

  async close(): Promise<void> {
    await getNative("window").window_close(this._handle);
  }

  async isTopMost(): Promise<boolean> {
    return await getNative("window").window_isTopMost(this._handle);
  }

  async isBorderless(): Promise<boolean> {
    return await getNative("window").window_isBorderless(this._handle);
  }

  async isMinimized(): Promise<boolean> {
    return await getNative("window").window_isMinimized(this._handle);
  }

  async isMaximized(): Promise<boolean> {
    return await getNative("window").window_isMaximized(this._handle);
  }

  async setTopMost(topMost: boolean): Promise<void> {
    await getNative("window").window_setTopMost(this._handle, topMost);
  }

  async setBorderless(borderless: boolean): Promise<void> {
    await getNative("window").window_setBorderless(this._handle, borderless);
  }

  async setMinimized(minimized: boolean): Promise<void> {
    await getNative("window").window_setMinimized(this._handle, minimized);
  }

  async setMaximized(maximized: boolean): Promise<void> {
    await getNative("window").window_setMaximized(this._handle, maximized);
  }

  async getProcess(): Promise<any> {
    const { Process } = require("../process");
    return new Process(await getNative("window").window_getProcess(this._handle));
  }

  async getPID(): Promise<number> {
    return await getNative("window").window_getPID(this._handle);
  }

  getHandle(): number {
    return this._handle;
  }

  async setHandle(handle: number): Promise<boolean> {
    const result = await getNative("window").window_setHandle(this._handle, handle);
    if (result) this._handle = handle;
    return result;
  }

  async getTitle(): Promise<string> {
    return await getNative("window").window_getTitle(this._handle);
  }

  async setTitle(title: string): Promise<void> {
    await getNative("window").window_setTitle(this._handle, title);
  }

  async getBounds(): Promise<Bounds> {
    const b = await getNative("window").window_getBounds(this._handle);
    return new Bounds(b.x, b.y, b.w, b.h);
  }

  async setBounds(): Promise<void>;
  async setBounds(bounds: Bounds | { x: number; y: number; w: number; h: number }): Promise<void>;
  async setBounds(x: number, y: number, w: number, h: number): Promise<void>;
  async setBounds(a?: Bounds | { x: number; y: number; w: number; h: number } | number, b?: number, c?: number, d?: number): Promise<void> {
    if (a === undefined) {
      await getNative("window").window_setBounds(this._handle, 0, 0, 0, 0);
    } else if (typeof a === "number") {
      await getNative("window").window_setBounds(this._handle, a, b!, c!, d!);
    } else {
      await getNative("window").window_setBounds(this._handle, a.x, a.y, a.w, a.h);
    }
  }

  async getClient(): Promise<Bounds> {
    const b = await getNative("window").window_getClient(this._handle);
    return new Bounds(b.x, b.y, b.w, b.h);
  }

  async setClient(): Promise<void>;
  async setClient(bounds: Bounds | { x: number; y: number; w: number; h: number }): Promise<void>;
  async setClient(x: number, y: number, w: number, h: number): Promise<void>;
  async setClient(a?: Bounds | { x: number; y: number; w: number; h: number } | number, b?: number, c?: number, d?: number): Promise<void> {
    if (a === undefined) {
      await getNative("window").window_setClient(this._handle, 0, 0, 0, 0);
    } else if (typeof a === "number") {
      await getNative("window").window_setClient(this._handle, a, b!, c!, d!);
    } else {
      await getNative("window").window_setClient(this._handle, a.x, a.y, a.w, a.h);
    }
  }

  async mapToClient(): Promise<Point>;
  async mapToClient(point: Point | { x: number; y: number }): Promise<Point>;
  async mapToClient(x: number, y: number): Promise<Point>;
  async mapToClient(a?: Point | { x: number; y: number } | number, b?: number): Promise<Point> {
    let x: number, y: number;
    if (a === undefined) {
      x = 0; y = 0;
    } else if (typeof a === "number") {
      x = a; y = b !== undefined ? b : a;
    } else {
      x = a.x; y = a.y;
    }
    const p = await getNative("window").window_mapToClient(this._handle, x, y);
    return new Point(p.x, p.y);
  }

  async mapToScreen(): Promise<Point>;
  async mapToScreen(point: Point | { x: number; y: number }): Promise<Point>;
  async mapToScreen(x: number, y: number): Promise<Point>;
  async mapToScreen(a?: Point | { x: number; y: number } | number, b?: number): Promise<Point> {
    let x: number, y: number;
    if (a === undefined) {
      x = 0; y = 0;
    } else if (typeof a === "number") {
      x = a; y = b !== undefined ? b : a;
    } else {
      x = a.x; y = a.y;
    }
    const p = await getNative("window").window_mapToScreen(this._handle, x, y);
    return new Point(p.x, p.y);
  }

  eq(other: Window | number): boolean {
    if (other instanceof Window) {
      return this._handle === other._handle;
    }
    return this._handle === other;
  }

  ne(other: Window | number): boolean {
    return !this.eq(other);
  }

  clone(): Window {
    return new Window(this._handle);
  }

  static async getList(title?: string): Promise<Window[]> {
    const handles: number[] = await getNative("window").window_getList(title);
    return handles.map((h) => new Window(h));
  }

  static async getActive(): Promise<Window> {
    return new Window(await getNative("window").window_getActive());
  }

  static async setActive(window: Window): Promise<void> {
    await getNative("window").window_setActive(window._handle);
  }

  static async isAxEnabled(prompt?: boolean): Promise<boolean> {
    return getNative("window").window_isAxEnabled(prompt);
  }
}
