/**
 * nolib uinput backend — uses the subprocess ioctl bridge to create and
 * drive a virtual input device via /dev/uinput, with no bun:ffi or native
 * modules required.
 *
 * Lifetime: a single device per process, lazily created on first use.
 * The ioctl bridge child process stays alive for the duration, piping
 * event buffers to /dev/uinput via its stdin.
 *
 * Open is async (the ioctl bridge spawns a subprocess) but the public
 * inject* helpers stay synchronous to preserve the makeInject* API
 * contract.  Events emitted before the stream is fully open are queued
 * and flushed in order once setup completes.
 */

import { ioctlStream, ioctlBridgeAvailable, type IoctlCall, type IoctlStream } from "./ioctl";
import {
  EV_SYN, EV_KEY, EV_REL, EV_ABS,
  REL_X, REL_Y, REL_WHEEL, REL_HWHEEL,
  ABS_X, ABS_Y,
  UI_DEV_CREATE, UI_DEV_SETUP,
  UI_SET_EVBIT, UI_SET_KEYBIT, UI_SET_RELBIT, UI_SET_ABSBIT, UI_ABS_SETUP,
  encodeEventBurst, encodeUinputSetup, encodeAbsSetup,
  allSupportedEvdevCodes, uinputAvailable,
  makeInjectKeysym, makeInjectMouseButton, makeInjectScroll, makeInjectRelMotion, makeInjectAbsMotion,
  UINPUT_ABS_MAX,
  type UInputEvent,
} from "../input/uinput";

let _stream: IoctlStream | null = null;
let _streamPromise: Promise<IoctlStream | null> | null = null;
let _openAttempted = false;
let _openReason: string | null = null;
let _pendingWrites: Buffer[] = [];

function buildSetupIoctls(): IoctlCall[] {
  const calls: IoctlCall[] = [];

  for (const ev of [EV_KEY, EV_REL, EV_ABS, EV_SYN]) {
    const data = Buffer.alloc(4);
    data.writeInt32LE(ev, 0);
    calls.push({ request: UI_SET_EVBIT, data });
  }

  for (const code of allSupportedEvdevCodes()) {
    const data = Buffer.alloc(4);
    data.writeInt32LE(code, 0);
    calls.push({ request: UI_SET_KEYBIT, data });
  }

  for (const rel of [REL_X, REL_Y, REL_WHEEL, REL_HWHEEL]) {
    const data = Buffer.alloc(4);
    data.writeInt32LE(rel, 0);
    calls.push({ request: UI_SET_RELBIT, data });
  }

  for (const abs of [ABS_X, ABS_Y]) {
    const data = Buffer.alloc(4);
    data.writeInt32LE(abs, 0);
    calls.push({ request: UI_SET_ABSBIT, data });
  }

  for (const code of [ABS_X, ABS_Y]) {
    calls.push({ request: UI_ABS_SETUP, data: encodeAbsSetup(code, { minimum: 0, maximum: UINPUT_ABS_MAX }) });
  }

  calls.push({ request: UI_DEV_SETUP, data: encodeUinputSetup("mechatron nolib input") });
  calls.push({ request: UI_DEV_CREATE, data: Buffer.alloc(4) });

  return calls;
}

function ensureStreamPromise(): Promise<IoctlStream | null> {
  if (_streamPromise) return _streamPromise;
  if (_openAttempted) return Promise.resolve(_stream);
  _openAttempted = true;

  if (!ioctlBridgeAvailable()) {
    _openReason = "no interpreter (perl/python) available";
    _streamPromise = Promise.resolve(null);
    return _streamPromise;
  }

  const calls = buildSetupIoctls();
  _streamPromise = ioctlStream("/dev/uinput", calls).then((s) => {
    if (!s) {
      _openReason = "ioctlStream failed (device not writable or ioctl error)";
      return null;
    }
    _stream = s;
    // Drain any writes queued during setup.
    if (_pendingWrites.length > 0) {
      const queued = _pendingWrites;
      _pendingWrites = [];
      for (const b of queued) {
        try { s.write(b); } catch { /* ignore */ }
      }
    }
    return s;
  }).catch(() => {
    _openReason = "ioctlStream rejected";
    return null;
  });
  return _streamPromise;
}

export async function nolibUinputReady(): Promise<boolean> {
  return (await ensureStreamPromise()) !== null;
}

export function nolibUinputOpenReason(): string | null {
  return _openReason;
}

export function nolibUinputAvailable(): boolean {
  return process.platform === "linux" && ioctlBridgeAvailable() && uinputAvailable();
}

function emit(events: UInputEvent[]): boolean {
  const buf = encodeEventBurst(events);
  if (_stream && _stream.alive) {
    return _stream.write(buf);
  }
  // Queue the write; kick off async open if not started.  Returns true
  // optimistically — the actual delivery is best-effort.
  _pendingWrites.push(buf);
  // Fire-and-forget: ensures setup runs and pending writes drain.
  void ensureStreamPromise();
  return true;
}

export const injectKeysym = makeInjectKeysym(emit);
export const injectMouseButton = makeInjectMouseButton(emit);
export const injectScrollV = makeInjectScroll(emit, REL_WHEEL);
export const injectScrollH = makeInjectScroll(emit, REL_HWHEEL);
export const injectRelMotion = makeInjectRelMotion(emit);
export const injectAbsMotion = makeInjectAbsMotion(emit);

export { UINPUT_ABS_MAX };

export function closeNolibUinput(): void {
  if (_stream) {
    _stream.close();
    _stream = null;
  }
  _streamPromise = null;
  _pendingWrites = [];
}

if (process.platform === "linux" && typeof process.on === "function") {
  process.on("exit", () => { closeNolibUinput(); });
}
