/**
 * ffi screen worker (x11 variant) — dispatches screen_* FFI ops on a
 * dedicated worker thread for the Linux x11 implementation.  Mirrors
 * screen-worker.ts but loads the variant-specific impl module so the
 * worker only dlopens libX11 (and never the macOS/Windows variants).
 */
import * as impl from "./screen-x11-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
