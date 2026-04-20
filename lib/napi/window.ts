/**
 * napi window backend — loads @mechatronic/napi-window .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("window");

export const window_isValid: (handle: number) => boolean = native.window_isValid;
export const window_close: (handle: number) => void = native.window_close;
export const window_isTopMost: (handle: number) => boolean = native.window_isTopMost;
export const window_isBorderless: (handle: number) => boolean = native.window_isBorderless;
export const window_isMinimized: (handle: number) => boolean = native.window_isMinimized;
export const window_isMaximized: (handle: number) => boolean = native.window_isMaximized;
export const window_setTopMost: (handle: number, topMost: boolean) => void = native.window_setTopMost;
export const window_setBorderless: (handle: number, borderless: boolean) => void = native.window_setBorderless;
export const window_setMinimized: (handle: number, minimized: boolean) => void = native.window_setMinimized;
export const window_setMaximized: (handle: number, maximized: boolean) => void = native.window_setMaximized;
export const window_getProcess: (handle: number) => number = native.window_getProcess;
export const window_getPID: (handle: number) => number = native.window_getPID;
export const window_getHandle: (handle: number) => number = native.window_getHandle;
export const window_setHandle: (handle: number, newHandle: number) => boolean = native.window_setHandle;
export const window_getTitle: (handle: number) => string = native.window_getTitle;
export const window_setTitle: (handle: number, title: string) => void = native.window_setTitle;
export const window_getBounds: (handle: number) => { x: number; y: number; w: number; h: number } = native.window_getBounds;
export const window_setBounds: (handle: number, x: number, y: number, w: number, h: number) => void = native.window_setBounds;
export const window_getClient: (handle: number) => { x: number; y: number; w: number; h: number } = native.window_getClient;
export const window_setClient: (handle: number, x: number, y: number, w: number, h: number) => void = native.window_setClient;
export const window_mapToClient: (handle: number, x: number, y: number) => { x: number; y: number } = native.window_mapToClient;
export const window_mapToScreen: (handle: number, x: number, y: number) => { x: number; y: number } = native.window_mapToScreen;
export const window_getList: (regex?: string) => number[] = native.window_getList;
export const window_getActive: () => number = native.window_getActive;
export const window_setActive: (handle: number) => void = native.window_setActive;
export const window_isAxEnabled: (prompt?: boolean) => boolean = native.window_isAxEnabled;
