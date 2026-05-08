/**
 * napi screen backend — base loader for non-Linux platforms.
 *
 * macOS / Windows have a single OS-native screen-capture API with no
 * variant fan-out, so this file directly loads
 * `mechatron-screen.<platform>.node` from the @mechatronic/napi-screen
 * package.
 *
 * On Linux the package instead ships variant-specific binaries
 * (mechatron-screen-x11, mechatron-screen-portal) which are loaded by
 * lib/napi/screen-x11.ts and lib/napi/screen-portal.ts.  This base file
 * is reached only as a fallback for an unsupported variant (e.g. an
 * explicit napi[vt] request); throw at load so the dispatcher in
 * lib/backend.ts moves on to the next backend.
 */

import { loadNapi } from "./resolve";

if (process.platform === "linux") {
  throw new Error("napi/screen: Linux requires a variant — use napi[x11] or napi[portal]");
}

const native = loadNapi("screen");

export const screen_synchronize: () => Promise<any[] | null> = native.screen_synchronize;
export const screen_grabScreen: (x: number, y: number, w: number, h: number, windowHandle?: number) => Promise<Uint32Array | null> = native.screen_grabScreen;
export const screen_getPortalToken: () => Promise<string | null> = native.screen_getPortalToken;
export const screen_setPortalToken: (token: string) => Promise<void> = native.screen_setPortalToken;
