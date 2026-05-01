/**
 * nolib screen backend — pure TypeScript, no native libraries.
 *
 * Dispatches to variant-specific implementations:
 *   - x11:    xproto GetImage + RandR GetMonitors. Requires $DISPLAY.
 *   - portal: xdg-desktop-portal Screenshot + Mutter DisplayConfig.
 *   - vt:     Linux framebuffer (/dev/fb0) raw byte read.
 */

import { getNolibVariant } from "../backend";

const VARIANT = getNolibVariant();

if (VARIANT === "gext") {
  throw new Error("nolib/screen[gext]: no gext screen implementation; use nolib[portal] or nolib[x11]");
}

const impl: typeof import("./screen-x11") =
  VARIANT === "portal" ? require("./screen-portal") :
  VARIANT === "vt"     ? require("./screen-vt") :
                         require("./screen-x11");

export const screen_synchronize = impl.screen_synchronize;
export const screen_grabScreen  = impl.screen_grabScreen;
