/**
 * napi clipboard backend — loads @mechatronic/napi-clipboard .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("clipboard");

export const clipboard_clear: () => void = native.clipboard_clear;
export const clipboard_hasText: () => boolean = native.clipboard_hasText;
export const clipboard_getText: () => string = native.clipboard_getText;
export const clipboard_setText: (text: string) => void = native.clipboard_setText;
export const clipboard_hasImage: () => boolean = native.clipboard_hasImage;
export const clipboard_getImage: () => { width: number; height: number; data: Uint32Array } | null = native.clipboard_getImage;
export const clipboard_setImage: (width: number, height: number, data: Uint32Array) => void = native.clipboard_setImage;
export const clipboard_getSequence: () => number = native.clipboard_getSequence;
