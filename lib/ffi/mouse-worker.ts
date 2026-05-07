/**
 * ffi mouse worker — dispatches mouse_* FFI ops on a dedicated
 * worker thread. The synchronous implementation lives in mouse-impl.ts;
 * this worker forwards { id, op, args } messages via runWorker.
 */
import * as impl from "./mouse-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
