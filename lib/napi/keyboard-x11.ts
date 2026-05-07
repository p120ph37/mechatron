/**
 * napi keyboard backend (x11 variant) — Linux-only.
 *
 * Loads the mechatron-keyboard-x11.<platform>.node binary out of the
 * @mechatronic/napi-keyboard package.  That binary has libX11.so.6 and
 * libXtst.so.6 as NEEDED entries, so a `require` failure here cleanly
 * indicates an X11-less system; the dispatcher in lib/backend.ts
 * catches the error and falls through to the next backend variant.
 */

import { loadNapi } from "./resolve";

const native = loadNapi("keyboard", "x11");

export const keyboard_press: (keycode: number) => Promise<void> = native.keyboard_press;
export const keyboard_release: (keycode: number) => Promise<void> = native.keyboard_release;
export const keyboard_getKeyState: (keycode: number) => Promise<boolean> = native.keyboard_getKeyState;
