/**
 * nolib window backend — pure TypeScript, no native libraries.
 *
 * Dispatches to variant-specific implementations:
 *   - x11:    X11 wire protocol (xproto) over Unix/TCP socket.
 *   - portal: GNOME Shell extension D-Bus + AT-SPI2 read-only fallback.
 */

import { getNolibVariant } from "../backend";

const VARIANT = getNolibVariant();

const impl: typeof import("./window-x11") =
  VARIANT === "portal"
    ? require("./window-portal")
    : require("./window-x11");

export const window_isValid     = impl.window_isValid;
export const window_close       = impl.window_close;
export const window_isTopMost   = impl.window_isTopMost;
export const window_isBorderless = impl.window_isBorderless;
export const window_isMinimized = impl.window_isMinimized;
export const window_isMaximized = impl.window_isMaximized;
export const window_setTopMost  = impl.window_setTopMost;
export const window_setBorderless = impl.window_setBorderless;
export const window_setMinimized = impl.window_setMinimized;
export const window_setMaximized = impl.window_setMaximized;
export const window_getProcess  = impl.window_getProcess;
export const window_getPID      = impl.window_getPID;
export const window_getHandle   = impl.window_getHandle;
export const window_setHandle   = impl.window_setHandle;
export const window_getTitle    = impl.window_getTitle;
export const window_setTitle    = impl.window_setTitle;
export const window_getBounds   = impl.window_getBounds;
export const window_setBounds   = impl.window_setBounds;
export const window_getClient   = impl.window_getClient;
export const window_setClient   = impl.window_setClient;
export const window_mapToClient = impl.window_mapToClient;
export const window_mapToScreen = impl.window_mapToScreen;
export const window_getList     = impl.window_getList;
export const window_getActive   = impl.window_getActive;
export const window_setActive   = impl.window_setActive;
export const window_isAxEnabled = impl.window_isAxEnabled;

export { installExtension, isExtensionInstalled, isExtensionEnabled } from "../portal/gnome-ext-installer";
