/**
 * Backwards-compatible re-export of the backend resolver.
 *
 * Internal code now imports from "./backend" directly.  This file is
 * retained so any external code that imported from "mechatron/lib/napi"
 * (or the old `require("./napi")` in tests) continues to work.
 */
export { getNative, isAvailable, getBackend, SUBSYSTEMS, _resetBackend } from "./backend";
export type { Subsystem, Backend, Variant, BackendEntry } from "./backend";
