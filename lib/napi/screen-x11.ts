/**
 * napi screen backend (x11 variant) — Linux-only.
 *
 * Loads the mechatron-screen-x11.<platform>.node binary out of the
 * @mechatronic/napi-screen package.  That binary has libX11.so.6 and
 * libXrandr.so.2 as NEEDED entries, so a `require` failure here cleanly
 * indicates an X11-less system; the dispatcher in lib/backend.ts
 * catches the error and falls through to the next backend variant.
 *
 * Only screen_synchronize and screen_grabScreen are exported — the
 * portal-token persistence functions (screen_getPortalToken /
 * screen_setPortalToken) are portal-only and the matrix marks them as
 * `skip` on linux-napi[x11].
 */

import { loadNapi } from "./resolve";

const native = loadNapi("screen", "x11");

export const screen_synchronize: () => Promise<any[] | null> = native.screen_synchronize;
export const screen_grabScreen: (x: number, y: number, w: number, h: number, windowHandle?: number) => Promise<Uint32Array | null> = native.screen_grabScreen;
