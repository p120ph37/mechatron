/**
 * mechatron — modern desktop automation API.
 *
 * All subsystem TypeScript lives in this package.  Native binaries are
 * delivered via optional `@mechatronic/napi-*` packages — install only the
 * subsystems you need, or omit AV-sensitive ones like `napi-memory`.
 *
 * Legacy robot-js 2.2.0 callers should use `mechatron-robot-js`, which
 * layers the historical shape on top of this module.
 */

// Data types
export { Point, Size, Bounds, Color, Range, Hash, Image, Timer, Ptr } from "./types";

// Keyboard
export { Keyboard, KEYS, getAllKeys, getKeyNames, getAllKeyConstants } from "./keyboard";
export type { KeyTable } from "./keyboard";

// Mouse
export {
  Mouse,
  BUTTON_LEFT, BUTTON_MID, BUTTON_MIDDLE, BUTTON_RIGHT, BUTTON_X1, BUTTON_X2,
} from "./mouse";

// Clipboard
export { Clipboard } from "./clipboard";

// Screen
export { Screen } from "./screen";
export type { WindowLike } from "./screen";

// Window
export { Window } from "./window";

// Process / Module
export { Process, Module, Segment } from "./process";
export type { ModuleData } from "./process";

// Memory
export {
  Memory, Stats, Region,
  MEMORY_DEFAULT, MEMORY_SKIP_ERRORS, MEMORY_AUTO_ACCESS,
} from "./memory";

// Native availability checking
export { isAvailable, getBackend } from "./backend";
export type { Subsystem, Backend, Variant, BackendEntry } from "./backend";

// Platform mechanism introspection — discover / select / override which
// backend mechanism is in use per capability, and manage cacheable
// permission handles for mechanisms that use them.
export {
  Platform, listMechanisms, getMechanism, getPreferredMechanisms,
  setMechanism, resetMechanism, getCapabilities,
  saveScreenPermission, loadScreenPermission,
} from "./platform";
export type {
  PlatformCapability, MechanismInfo, CapabilitySummary,
} from "./platform";

/** Version of the mechatron meta-package. */
export const VERSION = "0.0.0";
