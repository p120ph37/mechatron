/**
 * nolib screen backend — pure TypeScript, no native libraries.
 *
 * Dispatches to variant-specific implementations:
 *   - x11:    xproto GetImage + RandR GetMonitors. Requires $DISPLAY.
 *   - gext:   Mechatron GNOME Shell extension's Shell.Screenshot wrapper.
 *             GNOME-only, no popups, no /tmp file detour.
 *   - portal: xdg-desktop-portal Screenshot + Mutter DisplayConfig.
 *   - vt:     Linux framebuffer (/dev/fb0) raw byte read.
 */

import { getNolibVariant } from "../backend";

const VARIANT = getNolibVariant();

const impl: typeof import("./screen-x11") =
  VARIANT === "portal" ? require("./screen-portal") :
  VARIANT === "gext"   ? require("./screen-gext") :
  VARIANT === "vt"     ? require("./screen-vt") :
                         require("./screen-x11");

export const screen_synchronize = impl.screen_synchronize;
export const screen_grabScreen  = impl.screen_grabScreen;

export const screen_getPortalToken: () => string | null =
  (impl as any).screen_getPortalToken ?? (() => null);
export const screen_setPortalToken: (token: string | null) => void =
  (impl as any).screen_setPortalToken ?? (() => {});
