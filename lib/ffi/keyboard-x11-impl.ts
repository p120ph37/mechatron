/**
 * ffi keyboard backend (x11 variant) — Linux-only synchronous worker-side
 * implementation.
 *
 * Extracted from keyboard-impl.ts as part of the variant split that
 * mirrors napi[x11]/napi[portal].  This file contains only the X11 +
 * uinput injection paths; the worker entry (keyboard-x11-worker.ts) loads
 * it and the main-thread proxy (keyboard-x11.ts) dispatches into the
 * worker.  Selection between this variant and ffi[portal] (libei) is
 * handled by the backend resolver in lib/backend.ts.
 */

import { injectKeysym, uinputSelected } from "./uinput";
import {
  getDisplay, isXTestAvailable, x11, xtest,
} from "./x11";
import { getBunFFI } from "./bun";

export function keyboard_press(keycode: number): void {
  if (uinputSelected()) {
    if (injectKeysym(keycode, true)) return;
  }
  const X = x11(); const XT = xtest(); const d = getDisplay();
  if (!X || !XT || !d) return;
  const xkeycode = X.XKeysymToKeycode(d, BigInt(keycode));
  if (xkeycode === 0) return;
  XT.XTestFakeKeyEvent(d, xkeycode, 1, 0n);
  X.XSync(d, 0);
}

export function keyboard_release(keycode: number): void {
  if (uinputSelected()) {
    if (injectKeysym(keycode, false)) return;
  }
  const X = x11(); const XT = xtest(); const d = getDisplay();
  if (!X || !XT || !d) return;
  const xkeycode = X.XKeysymToKeycode(d, BigInt(keycode));
  if (xkeycode === 0) return;
  XT.XTestFakeKeyEvent(d, xkeycode, 0, 0n);
  X.XSync(d, 0);
}

export function keyboard_getKeyState(keycode: number): boolean {
  const X = x11(); const F = getBunFFI(); const d = getDisplay();
  if (!X || !F || !d) return false;
  const xkeycode = X.XKeysymToKeycode(d, BigInt(keycode));
  if (xkeycode === 0) return false;
  const keys = new Uint8Array(32);
  X.XQueryKeymap(d, F.ptr(keys));
  return (keys[(xkeycode / 8) | 0] & (1 << (xkeycode % 8))) !== 0;
}

// Signal unavailability to the backend resolver when the required native
// libraries cannot be loaded.
if (!isXTestAvailable() && !uinputSelected()) {
  throw new Error("ffi/keyboard-x11: requires libXtst or uinput");
}
