import { Bounds } from "../types";
import { Point } from "../types";
import { getNative } from "../napi";

export class Window {
  private _handle: number;

  constructor(handle?: number | Window) {
    if (handle instanceof Window) {
      this._handle = handle._handle;
    } else {
      this._handle = handle || 0;
    }
  }

  isValid(): boolean {
    return getNative("window").window_isValid(this._handle);
  }

  close(): void {
    getNative("window").window_close(this._handle);
  }

  isTopMost(): boolean {
    return getNative("window").window_isTopMost(this._handle);
  }

  isBorderless(): boolean {
    return getNative("window").window_isBorderless(this._handle);
  }

  isMinimized(): boolean {
    return getNative("window").window_isMinimized(this._handle);
  }

  isMaximized(): boolean {
    return getNative("window").window_isMaximized(this._handle);
  }

  setTopMost(topMost: boolean): void {
    getNative("window").window_setTopMost(this._handle, topMost);
  }

  setBorderless(borderless: boolean): void {
    getNative("window").window_setBorderless(this._handle, borderless);
  }

  setMinimized(minimized: boolean): void {
    getNative("window").window_setMinimized(this._handle, minimized);
  }

  setMaximized(maximized: boolean): void {
    getNative("window").window_setMaximized(this._handle, maximized);
  }

  getProcess(): any {
    const { Process } = require("../process");
    return new Process(getNative("window").window_getProcess(this._handle));
  }

  getPID(): number {
    return getNative("window").window_getPID(this._handle);
  }

  getHandle(): number {
    return this._handle;
  }

  setHandle(handle: number): boolean {
    const result = getNative("window").window_setHandle(this._handle, handle);
    if (result) this._handle = handle;
    return result;
  }

  getTitle(): string {
    return getNative("window").window_getTitle(this._handle);
  }

  setTitle(title: string): void {
    getNative("window").window_setTitle(this._handle, title);
  }

  getBounds(): Bounds {
    const b = getNative("window").window_getBounds(this._handle);
    return new Bounds(b.x, b.y, b.w, b.h);
  }

  setBounds(): void;
  setBounds(bounds: Bounds | { x: number; y: number; w: number; h: number }): void;
  setBounds(x: number, y: number, w: number, h: number): void;
  setBounds(a?: Bounds | { x: number; y: number; w: number; h: number } | number, b?: number, c?: number, d?: number): void {
    if (a === undefined) {
      getNative("window").window_setBounds(this._handle, 0, 0, 0, 0);
    } else if (typeof a === "number") {
      getNative("window").window_setBounds(this._handle, a, b!, c!, d!);
    } else {
      getNative("window").window_setBounds(this._handle, a.x, a.y, a.w, a.h);
    }
  }

  getClient(): Bounds {
    const b = getNative("window").window_getClient(this._handle);
    return new Bounds(b.x, b.y, b.w, b.h);
  }

  setClient(): void;
  setClient(bounds: Bounds | { x: number; y: number; w: number; h: number }): void;
  setClient(x: number, y: number, w: number, h: number): void;
  setClient(a?: Bounds | { x: number; y: number; w: number; h: number } | number, b?: number, c?: number, d?: number): void {
    if (a === undefined) {
      getNative("window").window_setClient(this._handle, 0, 0, 0, 0);
    } else if (typeof a === "number") {
      getNative("window").window_setClient(this._handle, a, b!, c!, d!);
    } else {
      getNative("window").window_setClient(this._handle, a.x, a.y, a.w, a.h);
    }
  }

  mapToClient(): Point;
  mapToClient(point: Point | { x: number; y: number }): Point;
  mapToClient(x: number, y: number): Point;
  mapToClient(a?: Point | { x: number; y: number } | number, b?: number): Point {
    let x: number, y: number;
    if (a === undefined) {
      x = 0; y = 0;
    } else if (typeof a === "number") {
      x = a; y = b !== undefined ? b : a;
    } else {
      x = a.x; y = a.y;
    }
    const p = getNative("window").window_mapToClient(this._handle, x, y);
    return new Point(p.x, p.y);
  }

  mapToScreen(): Point;
  mapToScreen(point: Point | { x: number; y: number }): Point;
  mapToScreen(x: number, y: number): Point;
  mapToScreen(a?: Point | { x: number; y: number } | number, b?: number): Point {
    let x: number, y: number;
    if (a === undefined) {
      x = 0; y = 0;
    } else if (typeof a === "number") {
      x = a; y = b !== undefined ? b : a;
    } else {
      x = a.x; y = a.y;
    }
    const p = getNative("window").window_mapToScreen(this._handle, x, y);
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

  static getList(title?: string): Window[] {
    const handles: number[] = getNative("window").window_getList(title);
    return handles.map((h) => new Window(h));
  }

  static async getListAsync(title?: string): Promise<Window[]> {
    return new Promise((resolve) => queueMicrotask(() => resolve(Window.getList(title))));
  }

  static getActive(): Window {
    return new Window(getNative("window").window_getActive());
  }

  static setActive(window: Window): void {
    getNative("window").window_setActive(window._handle);
  }

  static isAxEnabled(prompt?: boolean): boolean {
    return getNative("window").window_isAxEnabled(prompt);
  }
}
