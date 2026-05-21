/**
 * ffi keyboard worker — dispatches keyboard_* FFI ops on a dedicated
 * worker thread. The synchronous implementation lives in keyboard-impl.ts;
 * this worker forwards { id, op, args } messages via runWorker.
 */
import * as impl from "./keyboard-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
