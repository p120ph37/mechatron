/**
 * ffi screen worker — dispatches screen_* FFI ops on a dedicated
 * worker thread. The synchronous implementation lives in screen-impl.ts;
 * this worker forwards { id, op, args } messages via runWorker.
 */
import * as impl from "./screen-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
