/**
 * nolib mouse backend — pure TypeScript, no native libraries.
 *
 * Dispatches to variant-specific implementations:
 *   - x11:    XTest FakeButtonEvent / WarpPointer over xproto. Requires $DISPLAY.
 *   - portal: RemoteDesktop D-Bus. Requires Wayland + portal.
 *   - vt:     /dev/uinput via ioctl bridge.
 */

import { getNolibVariant } from "../backend";

const VARIANT = getNolibVariant();

const impl: typeof import("./mouse-x11") =
  VARIANT === "portal" ? require("./mouse-portal") :
  VARIANT === "vt"     ? require("./mouse-vt") :
                         require("./mouse-x11");

export const mouse_press          = impl.mouse_press;
export const mouse_release        = impl.mouse_release;
export const mouse_scrollH        = impl.mouse_scrollH;
export const mouse_scrollV        = impl.mouse_scrollV;
export const mouse_getPos         = impl.mouse_getPos;
export const mouse_setPos         = impl.mouse_setPos;
export const mouse_getButtonState = impl.mouse_getButtonState;
