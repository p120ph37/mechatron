/**
 * ffi window worker — dispatches window_* FFI ops on a dedicated
 * worker thread. The synchronous implementation lives in window-impl.ts;
 * this worker forwards { id, op, args } messages via runWorker.
 */
import * as impl from "./window-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
