/**
 * nolib clipboard backend — pure TypeScript, no native libraries.
 *
 * Dispatches to variant-specific implementations:
 *   - x11:  ICCCM CLIPBOARD selection over the xproto wire protocol.
 *   - gext: D-Bus call into the Mechatron GNOME Shell extension's
 *           St.Clipboard wrapper.  GNOME-only, no popups, no subprocess.
 *   - sh:   wl-copy / xclip / xsel subprocess on Linux, pbcopy / pbpaste
 *           on macOS.
 *   - portal: (TODO) xdg-desktop-portal has no clipboard interface —
 *           reserved for if/when one ships.
 */

import { getNolibVariant } from "../backend";

const VARIANT = getNolibVariant();

const impl: typeof import("./clipboard-x11") =
  VARIANT === "x11"
    ? require("./clipboard-x11")
    : VARIANT === "gext"
    ? require("./clipboard-gext")
    : require("./clipboard-sh");

export const clipboard_clear      = impl.clipboard_clear;
export const clipboard_hasText    = impl.clipboard_hasText;
export const clipboard_getText    = impl.clipboard_getText;
export const clipboard_setText    = impl.clipboard_setText;
export const clipboard_hasImage   = impl.clipboard_hasImage;
export const clipboard_getImage   = impl.clipboard_getImage;
export const clipboard_setImage   = impl.clipboard_setImage;
export const clipboard_getSequence = impl.clipboard_getSequence;
