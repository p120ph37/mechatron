/**
 * napi mouse backend (portal variant) — Linux-only.
 *
 * Loads the mechatron-mouse-portal.<platform>.node binary out of the
 * @mechatronic/napi-mouse package.  That binary has libei.so.1 as a
 * NEEDED entry and uses xdg-desktop-portal RemoteDesktop to acquire the
 * EIS file descriptor.  A `require` failure here indicates a system
 * without libei; the dispatcher in lib/backend.ts catches the error
 * and falls through to the next backend variant.
 */

import { loadNapi } from "./resolve";

const native = loadNapi("mouse", "portal");

export const mouse_press: (button: number) => Promise<void> = native.mouse_press;
export const mouse_release: (button: number) => Promise<void> = native.mouse_release;
export const mouse_scrollH: (amount: number) => Promise<void> = native.mouse_scrollH;
export const mouse_scrollV: (amount: number) => Promise<void> = native.mouse_scrollV;
export const mouse_getPos: () => Promise<{ x: number; y: number }> = native.mouse_getPos;
export const mouse_setPos: (x: number, y: number) => Promise<void> = native.mouse_setPos;
export const mouse_getButtonState: (button: number) => Promise<boolean> = native.mouse_getButtonState;
