/**
 * napi screen backend (portal variant) — Linux-only.
 *
 * Loads the mechatron-screen-portal.<platform>.node binary out of the
 * @mechatronic/napi-screen package.  That binary has no NEEDED libs
 * other than libc — libpipewire is dlopen'd lazily and the D-Bus
 * protocol runs over a raw socket — but it still depends on the
 * xdg-desktop-portal ScreenCast interface being reachable on the
 * session bus.  When the portal handshake fails the dispatcher in
 * lib/backend.ts catches the error and falls through to the next
 * backend variant.
 */

import { loadNapi } from "./resolve";

const native = loadNapi("screen", "portal");

export const screen_synchronize: () => Promise<any[] | null> = native.screen_synchronize;
export const screen_grabScreen: (x: number, y: number, w: number, h: number, windowHandle?: number) => Promise<Uint32Array | null> = native.screen_grabScreen;
export const screen_getPortalToken: () => Promise<string | null> = native.screen_getPortalToken;
export const screen_setPortalToken: (token: string | null) => Promise<void> = native.screen_setPortalToken;
