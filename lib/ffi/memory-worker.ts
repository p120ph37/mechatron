/**
 * ffi memory worker — dispatches memory_* FFI ops on a dedicated
 * worker thread. The synchronous implementation lives in memory-impl.ts.
 */
import * as impl from "./memory-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
