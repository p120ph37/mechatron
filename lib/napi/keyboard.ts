/**
 * napi keyboard backend — loads @mechatronic/napi-keyboard .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("keyboard");

export const keyboard_press: (keycode: number) => void = native.keyboard_press;
export const keyboard_release: (keycode: number) => void = native.keyboard_release;
export const keyboard_getKeyState: (keycode: number) => boolean = native.keyboard_getKeyState;
