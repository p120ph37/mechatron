/**
 * ffi screen worker (portal variant) — dispatches screen_* FFI ops on
 * a dedicated worker thread for the Wayland ScreenCast/PipeWire backend.
 */
import * as impl from "./screen-portal-impl";
import { runWorker } from "./_dispatch";

runWorker(impl);
