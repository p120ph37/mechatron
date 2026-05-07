/**
 * napi window backend — loads @mechatronic/napi-window .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("window");

export const window_isValid: (handle: number) => Promise<boolean> = native.window_isValid;
export const window_close: (handle: number) => Promise<void> = native.window_close;
export const window_isTopMost: (handle: number) => Promise<boolean> = native.window_isTopMost;
export const window_isBorderless: (handle: number) => Promise<boolean> = native.window_isBorderless;
export const window_isMinimized: (handle: number) => Promise<boolean> = native.window_isMinimized;
export const window_isMaximized: (handle: number) => Promise<boolean> = native.window_isMaximized;
export const window_setTopMost: (handle: number, topMost: boolean) => Promise<void> = native.window_setTopMost;
export const window_setBorderless: (handle: number, borderless: boolean) => Promise<void> = native.window_setBorderless;
export const window_setMinimized: (handle: number, minimized: boolean) => Promise<void> = native.window_setMinimized;
export const window_setMaximized: (handle: number, maximized: boolean) => Promise<void> = native.window_setMaximized;
export const window_getProcess: (handle: number) => Promise<number> = native.window_getProcess;
export const window_getPID: (handle: number) => Promise<number> = native.window_getPID;
export const window_getHandle: (handle: number) => Promise<number> = native.window_getHandle;
export const window_setHandle: (handle: number, newHandle: number) => Promise<boolean> = native.window_setHandle;
export const window_getTitle: (handle: number) => Promise<string> = native.window_getTitle;
export const window_setTitle: (handle: number, title: string) => Promise<void> = native.window_setTitle;
export const window_getBounds: (handle: number) => Promise<{ x: number; y: number; w: number; h: number }> = native.window_getBounds;
export const window_setBounds: (handle: number, x: number, y: number, w: number, h: number) => Promise<void> = native.window_setBounds;
export const window_getClient: (handle: number) => Promise<{ x: number; y: number; w: number; h: number }> = native.window_getClient;
export const window_setClient: (handle: number, x: number, y: number, w: number, h: number) => Promise<void> = native.window_setClient;
export const window_mapToClient: (handle: number, x: number, y: number) => Promise<{ x: number; y: number }> = native.window_mapToClient;
export const window_mapToScreen: (handle: number, x: number, y: number) => Promise<{ x: number; y: number }> = native.window_mapToScreen;
export const window_getList: (regex?: string) => Promise<number[]> = native.window_getList;
export const window_getActive: () => Promise<number> = native.window_getActive;
export const window_setActive: (handle: number) => Promise<void> = native.window_setActive;
export const window_isAxEnabled: (prompt?: boolean) => Promise<boolean> = native.window_isAxEnabled;
