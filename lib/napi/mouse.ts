/**
 * napi mouse backend — loads @mechatronic/napi-mouse .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("mouse");

export const mouse_press: (button: number) => void = native.mouse_press;
export const mouse_release: (button: number) => void = native.mouse_release;
export const mouse_scrollH: (amount: number) => void = native.mouse_scrollH;
export const mouse_scrollV: (amount: number) => void = native.mouse_scrollV;
export const mouse_getPos: () => { x: number; y: number } = native.mouse_getPos;
export const mouse_setPos: (x: number, y: number) => void = native.mouse_setPos;
export const mouse_getButtonState: (button: number) => boolean = native.mouse_getButtonState;
