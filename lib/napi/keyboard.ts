/**
 * napi keyboard backend — loads @mechatronic/napi-keyboard .node binary.
 */
import { loadNapi } from "./resolve";

const native = loadNapi("keyboard");

export const keyboard_press: (keycode: number) => Promise<void> = native.keyboard_press;
export const keyboard_release: (keycode: number) => Promise<void> = native.keyboard_release;
export const keyboard_getKeyState: (keycode: number) => Promise<boolean> = native.keyboard_getKeyState;
