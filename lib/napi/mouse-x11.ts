/**
 * napi mouse backend (x11 variant) — Linux-only.
 *
 * Loads the mechatron-mouse-x11.<platform>.node binary out of the
 * @mechatronic/napi-mouse package.  That binary has libX11.so.6 and
 * libXtst.so.6 as NEEDED entries, so a `require` failure here cleanly
 * indicates an X11-less system; the dispatcher in lib/backend.ts
 * catches the error and falls through to the next backend variant.
 */

import { loadNapi } from "./resolve";

const native = loadNapi("mouse", "x11");

export const mouse_press: (button: number) => Promise<void> = native.mouse_press;
export const mouse_release: (button: number) => Promise<void> = native.mouse_release;
export const mouse_scrollH: (amount: number) => Promise<void> = native.mouse_scrollH;
export const mouse_scrollV: (amount: number) => Promise<void> = native.mouse_scrollV;
export const mouse_getPos: () => Promise<{ x: number; y: number }> = native.mouse_getPos;
export const mouse_setPos: (x: number, y: number) => Promise<void> = native.mouse_setPos;
export const mouse_getButtonState: (button: number) => Promise<boolean> = native.mouse_getButtonState;
