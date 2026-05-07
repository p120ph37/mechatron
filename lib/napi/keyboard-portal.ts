/**
 * napi keyboard backend (portal variant) — Linux-only.
 *
 * Loads the mechatron-keyboard-portal.<platform>.node binary out of the
 * @mechatronic/napi-keyboard package.  That binary has libei.so.1 as a
 * NEEDED entry and uses xdg-desktop-portal RemoteDesktop to acquire the
 * EIS file descriptor.  A `require` failure here indicates a system
 * without libei; the dispatcher in lib/backend.ts catches the error
 * and falls through to the next backend variant.
 */

import { loadNapi } from "./resolve";

const native = loadNapi("keyboard", "portal");

export const keyboard_press: (keycode: number) => Promise<void> = native.keyboard_press;
export const keyboard_release: (keycode: number) => Promise<void> = native.keyboard_release;
export const keyboard_getKeyState: (keycode: number) => Promise<boolean> = native.keyboard_getKeyState;
