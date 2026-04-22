/**
 * nolib uinput backend — uses the subprocess ioctl bridge to create and
 * drive a virtual input device via /dev/uinput, with no bun:ffi or native
 * modules required.
 *
 * Lifetime: a single device per process, lazily created on first use.
 * The ioctl bridge child process stays alive for the duration, piping
 * event buffers to /dev/uinput via its stdin.
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
  type UInputEvent,
} from "../input/uinput";

let _stream: IoctlStream | null = null;
let _openAttempted = false;
let _openReason: string | null = null;

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

  // Configure axis ranges: 0–65535 (standard digitizer resolution).
  const ABS_MAX = 65535;
  for (const code of [ABS_X, ABS_Y]) {
    calls.push({ request: UI_ABS_SETUP, data: encodeAbsSetup(code, { minimum: 0, maximum: ABS_MAX }) });
  }

  calls.push({ request: UI_DEV_SETUP, data: encodeUinputSetup("mechatron nolib input") });
  calls.push({ request: UI_DEV_CREATE, data: Buffer.alloc(4) });

  return calls;
}

function getStream(): IoctlStream | null {
  if (_stream && _stream.alive) return _stream;
  if (_openAttempted) return null;
  _openAttempted = true;

  if (!ioctlBridgeAvailable()) {
    _openReason = "no interpreter (perl/python) available";
    return null;
  }

  const calls = buildSetupIoctls();
  _stream = ioctlStream("/dev/uinput", calls);
  if (!_stream) {
    _openReason = "ioctlStream failed (device not writable or ioctl error)";
    return null;
  }
  return _stream;
}

export function nolibUinputReady(): boolean {
  return getStream() !== null;
}

export function nolibUinputOpenReason(): string | null {
  return _openReason;
}

export function nolibUinputAvailable(): boolean {
  return process.platform === "linux" && ioctlBridgeAvailable() && uinputAvailable();
}

function emit(events: UInputEvent[]): boolean {
  const s = getStream();
  if (!s) return false;
  return s.write(encodeEventBurst(events));
}

export const injectKeysym = makeInjectKeysym(emit);
export const injectMouseButton = makeInjectMouseButton(emit);
export const injectScrollV = makeInjectScroll(emit, REL_WHEEL);
export const injectScrollH = makeInjectScroll(emit, REL_HWHEEL);
export const injectRelMotion = makeInjectRelMotion(emit);
export const injectAbsMotion = makeInjectAbsMotion(emit);

/** Maximum device coordinate for EV_ABS axes (standard digitizer range). */
export const UINPUT_ABS_MAX = 65535;

export function closeNolibUinput(): void {
  if (_stream) {
    _stream.close();
    _stream = null;
  }
}

if (process.platform === "linux" && typeof process.on === "function") {
  process.on("exit", () => { closeNolibUinput(); });
}
