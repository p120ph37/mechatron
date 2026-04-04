import { getAllKeyConstants, KeyTable } from "./constants";

export { Keyboard } from "./Keyboard";
export { getAllKeys, getKeyNames, getAllKeyConstants } from "./constants";
export type { KeyTable } from "./constants";

/**
 * Platform-specific key-code table, resolved once at import time.  Prefer this
 * over the legacy flat `KEY_*` top-level constants for modern code.
 */
export const KEYS: Readonly<KeyTable> = Object.freeze(getAllKeyConstants()) as Readonly<KeyTable>;
