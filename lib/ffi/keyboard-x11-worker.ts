/**
 * ffi keyboard worker (x11 variant) — dispatches keyboard_* FFI ops on
 * a dedicated worker thread for the Linux x11 implementation.  Mirrors
 * keyboard-worker.ts but loads the variant-specific impl module so the
 * worker only dlopens libX11/libXtst (and never the macOS/Windows
 * variants).
 */
import * as impl from "./keyboard-x11-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
