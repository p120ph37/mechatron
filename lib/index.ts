/**
 * mechatron — modern desktop automation API.
 *
 * This meta-package re-exports the full modern API of every subsystem package
 * (`mechatron-keyboard`, `-mouse`, `-clipboard`, `-screen`, `-window`,
 * `-process`, `-memory`, and the shared `-types`).  Consumers that only need
 * one capability should depend on that subsystem directly to minimise install
 * size and native-binary surface area.
 *
 * The API uses ordinary ES class constructors (no `callableClass()` proxy
 * magic), named exports throughout, and provides `*Async` variants for
 * operations that may block (screen capture, process / window enumeration,
 * memory scanning, clipboard IO).  Legacy robot-js 2.2.0 callers should use
 * `mechatron-robot-js`, which layers the historical shape on top of this
 * module.
 */

// Data types
export { Point, Size, Bounds, Color, Range, Hash, Image, Timer } from "mechatron-types";

// Keyboard
export { Keyboard, KEYS, getAllKeys, getKeyNames, getAllKeyConstants } from "mechatron-keyboard";
export type { KeyTable } from "mechatron-keyboard";

// Mouse
export {
  Mouse,
  BUTTON_LEFT, BUTTON_MID, BUTTON_MIDDLE, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2,
} from "mechatron-mouse";

// Clipboard
export { Clipboard } from "mechatron-clipboard";

// Screen
export { Screen } from "mechatron-screen";
export type { WindowLike } from "mechatron-screen";

// Window
export { Window } from "mechatron-window";

// Process / Module
export { Process, Module, Segment } from "mechatron-process";
export type { ModuleData } from "mechatron-process";

// Memory
export {
  Memory, Stats, Region,
  MEMORY_DEFAULT, MEMORY_SKIP_ERRORS, MEMORY_AUTO_ACCESS,
} from "mechatron-memory";

/** Version of the mechatron meta-package. */
export const VERSION = "0.0.0";
