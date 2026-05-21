/**
 * napi window backend — loads @mechatronic/napi-window .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("window");

export const window_isValid: (handle: bigint) => Promise<boolean> = native.window_isValid;
export const window_close: (handle: bigint) => Promise<void> = native.window_close;
export const window_isTopMost: (handle: bigint) => Promise<boolean> = native.window_isTopMost;
export const window_isBorderless: (handle: bigint) => Promise<boolean> = native.window_isBorderless;
export const window_isMinimized: (handle: bigint) => Promise<boolean> = native.window_isMinimized;
export const window_isMaximized: (handle: bigint) => Promise<boolean> = native.window_isMaximized;
export const window_setTopMost: (handle: bigint, topMost: boolean) => Promise<void> = native.window_setTopMost;
export const window_setBorderless: (handle: bigint, borderless: boolean) => Promise<void> = native.window_setBorderless;
export const window_setMinimized: (handle: bigint, minimized: boolean) => Promise<void> = native.window_setMinimized;
export const window_setMaximized: (handle: bigint, maximized: boolean) => Promise<void> = native.window_setMaximized;
export const window_getProcess: (handle: bigint) => Promise<number> = native.window_getProcess;
export const window_getPID: (handle: bigint) => Promise<number> = native.window_getPID;
export const window_getHandle: (handle: bigint) => Promise<bigint> = native.window_getHandle;
export const window_setHandle: (handle: bigint, newHandle: bigint) => Promise<boolean> = native.window_setHandle;
export const window_getTitle: (handle: bigint) => Promise<string> = native.window_getTitle;
export const window_setTitle: (handle: bigint, title: string) => Promise<void> = native.window_setTitle;
export const window_getBounds: (handle: bigint) => Promise<{ x: number; y: number; w: number; h: number }> = native.window_getBounds;
export const window_setBounds: (handle: bigint, x: number, y: number, w: number, h: number) => Promise<void> = native.window_setBounds;
export const window_getClient: (handle: bigint) => Promise<{ x: number; y: number; w: number; h: number }> = native.window_getClient;
export const window_setClient: (handle: bigint, x: number, y: number, w: number, h: number) => Promise<void> = native.window_setClient;
export const window_mapToClient: (handle: bigint, x: number, y: number) => Promise<{ x: number; y: number }> = native.window_mapToClient;
export const window_mapToScreen: (handle: bigint, x: number, y: number) => Promise<{ x: number; y: number }> = native.window_mapToScreen;
export const window_getList: (regex?: string) => Promise<bigint[]> = native.window_getList;
export const window_getActive: () => Promise<bigint> = native.window_getActive;
export const window_setActive: (handle: bigint) => Promise<void> = native.window_setActive;
export const window_isAxEnabled: (prompt?: boolean) => Promise<boolean> = native.window_isAxEnabled;
