/**
 * napi screen backend — loads @mechatronic/napi-screen .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("screen");

export const screen_synchronize: () => Promise<any[] | null> = native.screen_synchronize;
export const screen_grabScreen: (x: number, y: number, w: number, h: number, windowHandle?: number) => Promise<Uint32Array | null> = native.screen_grabScreen;
export const screen_getPortalToken: () => Promise<string | null> = native.screen_getPortalToken;
export const screen_setPortalToken: (token: string) => Promise<void> = native.screen_setPortalToken;
