/**
 * ffi mouse worker (x11 variant) — dispatches mouse_* FFI ops on a
 * dedicated worker thread for the Linux x11 implementation.  Mirrors
 * mouse-worker.ts but loads the variant-specific impl module so the
 * worker only dlopens libX11/libXtst (and never the macOS/Windows
 * variants).
 */
import * as impl from "./mouse-x11-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
