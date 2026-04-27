/**
 * nolib keyboard backend — pure TypeScript, no native libraries.
 *
 * Dispatches to variant-specific implementations:
 *   - x11:    XTest FakeKeyEvent over xproto. Requires $DISPLAY.
 *   - portal: RemoteDesktop D-Bus. Requires Wayland + portal.
 *   - vt:     /dev/uinput via ioctl bridge.
 */

import { getNolibVariant } from "../backend";

const VARIANT = getNolibVariant();

const impl: typeof import("./keyboard-x11") =
  VARIANT === "portal" ? require("./keyboard-portal") :
  VARIANT === "vt"     ? require("./keyboard-vt") :
                         require("./keyboard-x11");

export const keyboard_press       = impl.keyboard_press;
export const keyboard_release     = impl.keyboard_release;
export const keyboard_getKeyState = impl.keyboard_getKeyState;
