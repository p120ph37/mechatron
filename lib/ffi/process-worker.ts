/**
 * ffi process worker — dispatches process_* FFI ops on a dedicated
 * worker thread. Mirrors napi's libuv worker-pool semantics so the
 * main JS thread is never blocked by /proc reads, ptrace probes,
 * or Win32 / mach calls.
 *
 * The synchronous implementation lives in process-impl.ts; this
 * worker just forwards every `{ id, op, args }` message into it via
 * the generic runWorker dispatcher in _dispatch.ts.
 */

import * as impl from "./process-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
