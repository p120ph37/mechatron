/**
 * nolib clipboard backend — pure TypeScript, no native libraries.
 *
 * Dispatches to variant-specific implementations:
 *   - x11:  ICCCM CLIPBOARD selection over the xproto wire protocol.
 *   - sh:   wl-copy / xclip / xsel subprocess on Linux, pbcopy / pbpaste
 *           on macOS.
 *   - portal: (TODO) D-Bus xdg-desktop-portal Clipboard interface.
 */

import { getNolibVariant } from "../backend";

const VARIANT = getNolibVariant();

const impl: typeof import("./clipboard-x11") =
  VARIANT === "x11"
    ? require("./clipboard-x11")
    : require("./clipboard-sh");

export const clipboard_clear      = impl.clipboard_clear;
export const clipboard_hasText    = impl.clipboard_hasText;
export const clipboard_getText    = impl.clipboard_getText;
export const clipboard_setText    = impl.clipboard_setText;
export const clipboard_hasImage   = impl.clipboard_hasImage;
export const clipboard_getImage   = impl.clipboard_getImage;
export const clipboard_setImage   = impl.clipboard_setImage;
export const clipboard_getSequence = impl.clipboard_getSequence;
