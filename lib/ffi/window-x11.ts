/**
 * ffi window backend — X11 variant.
 *
 * Currently the only ffi window implementation; re-exports window.ts
 * so that the backend resolver tags it as ffi[x11] (matching the
 * COMPATIBILITY.md column name).
 */
export * from "./window";
