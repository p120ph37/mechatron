/**
 * libei worker — keyboard + mouse via Emulated Input protocol.
 *
 * Mirrors napi/src/ei_input.rs: gets an EIS fd from the RemoteDesktop
 * portal, dlopens libei.so.1, and runs the EI event loop.  Keyboard
 * and mouse commands are dispatched from the main thread via the
 * _dispatch.ts message protocol.
 */

const { parentPort } = require("worker_threads");
import { getBunFFI, bp, cstr } from "./bun";
import { portalGetEisFd } from "./portal-fd";
import * as net from "net";

if (!parentPort) process.exit(1);

const F = getBunFFI()!;
const T = F.FFIType;

// ── Keysym → evdev scancode (mirrors napi/src/ei_input.rs) ─────────

const AZ: number[] = [30,48,46,32,18,33,34,35,23,36,37,38,50,49,24,25,16,19,31,20,22,47,17,45,21,44];

function keysymToEvdev(k: number): number | null {
  if (k === 0x20) return 57;
  if (k === 0x27) return 40;
  if (k === 0x2C) return 51;
  if (k === 0x2D) return 12;
  if (k === 0x2E) return 52;
  if (k === 0x2F) return 53;
  if (k >= 0x30 && k <= 0x39) return k === 0x30 ? 11 : k - 0x30 + 1;
  if (k === 0x3B) return 39;
  if (k === 0x3D) return 13;
  if (k === 0x5B) return 26;
  if (k === 0x5C) return 43;
  if (k === 0x5D) return 27;
  if (k === 0x60) return 41;
  if (k >= 0x61 && k <= 0x7A) return AZ[k - 0x61];
  switch (k) {
    case 0xFF08: return 14;  case 0xFF09: return 15;  case 0xFF0D: return 28;
    case 0xFF13: return 119; case 0xFF14: return 70;  case 0xFF1B: return 1;
    case 0xFF50: return 102; case 0xFF51: return 105; case 0xFF52: return 103;
    case 0xFF53: return 106; case 0xFF54: return 108; case 0xFF55: return 104;
    case 0xFF56: return 109; case 0xFF57: return 107; case 0xFF61: return 99;
    case 0xFF63: return 110; case 0xFF7F: return 69;  case 0xFF8D: return 96;
    case 0xFFAA: return 55;  case 0xFFAB: return 78;  case 0xFFAD: return 74;
    case 0xFFAE: return 83;  case 0xFFAF: return 98;
    case 0xFFB0: return 82;  case 0xFFB1: return 79;  case 0xFFB2: return 80;
    case 0xFFB3: return 81;  case 0xFFB4: return 75;  case 0xFFB5: return 76;
    case 0xFFB6: return 77;  case 0xFFB7: return 71;  case 0xFFB8: return 72;
    case 0xFFB9: return 73;
    case 0xFFBE: return 59;  case 0xFFBF: return 60;  case 0xFFC0: return 61;
    case 0xFFC1: return 62;  case 0xFFC2: return 63;  case 0xFFC3: return 64;
    case 0xFFC4: return 65;  case 0xFFC5: return 66;  case 0xFFC6: return 67;
    case 0xFFC7: return 68;  case 0xFFC8: return 87;  case 0xFFC9: return 88;
    case 0xFFE1: return 42;  case 0xFFE2: return 54;  case 0xFFE3: return 29;
    case 0xFFE4: return 97;  case 0xFFE5: return 58;  case 0xFFE9: return 56;
    case 0xFFEA: return 100; case 0xFFEB: return 125; case 0xFFEC: return 126;
    case 0xFFFF: return 111;
    default: return null;
  }
}

function buttonToEvdev(b: number): number | null {
  switch (b) {
    case 0: return 0x110;
    case 1: return 0x112;
    case 2: return 0x111;
    case 3: return 0x113;
    case 4: return 0x114;
    default: return null;
  }
}

// ── libei bindings ──────────────────────────────────────────────────

const EI_SEAT_ADDED = 3;
const EI_DEVICE_ADDED = 5;
const EI_DEVICE_REMOVED = 6;
const EI_DEVICE_PAUSED = 7;
const EI_DEVICE_RESUMED = 8;
const EI_DISCONNECT = 2;

const CAP_POINTER = 1;
const CAP_POINTER_ABSOLUTE = 2;
const CAP_KEYBOARD = 4;
const CAP_SCROLL = 16;
const CAP_BUTTON = 32;

let ei: ReturnType<typeof F.dlopen>["symbols"];
try {
  ei = F.dlopen("libei.so.1", {
    ei_new_sender:              { args: [T.i64], returns: T.i64 },
    ei_unref:                   { args: [T.i64], returns: T.i64 },
    ei_configure_name:          { args: [T.i64, T.i64], returns: T.void },
    ei_setup_backend_fd:        { args: [T.i64, T.i32], returns: T.i32 },
    ei_get_fd:                  { args: [T.i64], returns: T.i32 },
    ei_dispatch:                { args: [T.i64], returns: T.void },
    ei_get_event:               { args: [T.i64], returns: T.i64 },
    ei_event_get_type:          { args: [T.i64], returns: T.i32 },
    ei_event_unref:             { args: [T.i64], returns: T.i64 },
    ei_event_get_seat:          { args: [T.i64], returns: T.i64 },
    ei_event_get_device:        { args: [T.i64], returns: T.i64 },
    ei_seat_bind_capabilities:  { args: [T.i64, T.i32, T.i32, T.i32, T.i32, T.i32, T.i64], returns: T.void },
    ei_device_ref:              { args: [T.i64], returns: T.i64 },
    ei_device_start_emulating:  { args: [T.i64, T.u32], returns: T.void },
    ei_device_frame:            { args: [T.i64, T.u64], returns: T.void },
    ei_now:                     { args: [T.i64], returns: T.u64 },
    ei_device_keyboard_key:     { args: [T.i64, T.u32, T.i32], returns: T.void },
    ei_device_pointer_motion_absolute: { args: [T.i64, T.f64, T.f64], returns: T.void },
    ei_device_button_button:    { args: [T.i64, T.u32, T.i32], returns: T.void },
    ei_device_scroll_discrete:  { args: [T.i64, T.i32, T.i32], returns: T.void },
  }).symbols;
} catch {
  process.exit(1);
}

const poll_lc = F.dlopen("libc.so.6", {
  poll: { args: [T.i64, T.u32, T.i32], returns: T.i32 },
}).symbols;

// ── EI session ──────────────────────────────────────────────────────

let eiCtx = 0n;
let device = 0n;
let seq = 0;
let ready = false;

function init(): boolean {
  const isWayland = !!process.env.WAYLAND_DISPLAY
    || (process.env.XDG_SESSION_TYPE || "") === "wayland";
  if (!isWayland) return false;

  const eisFd = portalGetEisFd();
  if (eisFd === null) return false;

  eiCtx = ei.ei_new_sender(0n) as bigint;
  if (eiCtx === 0n) return false;

  const name = cstr("mechatron");
  ei.ei_configure_name(eiCtx, bp(name));

  if ((ei.ei_setup_backend_fd as any)(eiCtx, eisFd) !== 0) {
    ei.ei_unref(eiCtx);
    eiCtx = 0n;
    return false;
  }

  const eiFd = (ei.ei_get_fd as any)(eiCtx) as number;
  const pollBuf = new Uint8Array(8);
  const pollDv = new DataView(pollBuf.buffer);

  for (let attempt = 0; attempt < 100; attempt++) {
    pollDv.setInt32(0, eiFd, true);
    pollDv.setInt16(4, 1, true);
    pollDv.setInt16(6, 0, true);
    poll_lc.poll(bp(pollBuf), 1, 500);
    if ((pollDv.getInt16(6, true) & 1) === 0) continue;

    ei.ei_dispatch(eiCtx);
    while (true) {
      const event = ei.ei_get_event(eiCtx) as bigint;
      if (event === 0n) break;
      const etype = (ei.ei_event_get_type as any)(event) as number;
      if (etype === EI_SEAT_ADDED) {
        const seat = ei.ei_event_get_seat(event) as bigint;
        if (seat !== 0n) {
          ei.ei_seat_bind_capabilities(
            seat, CAP_POINTER, CAP_POINTER_ABSOLUTE, CAP_KEYBOARD,
            CAP_BUTTON, CAP_SCROLL, 0n,
          );
        }
      } else if (etype === EI_DEVICE_ADDED) {
        const dev = ei.ei_event_get_device(event) as bigint;
        if (dev !== 0n) device = ei.ei_device_ref(dev) as bigint;
      } else if (etype === EI_DEVICE_RESUMED) {
        if (device !== 0n) {
          seq++;
          ei.ei_device_start_emulating(device, seq);
          ready = true;
        }
      }
      ei.ei_event_unref(event);
      if (ready) break;
    }
    if (ready) break;
  }

  if (!ready || device === 0n) {
    ei.ei_unref(eiCtx);
    eiCtx = 0n;
    return false;
  }

  const eiSocket = new net.Socket({ fd: eiFd, readable: true, writable: false });
  eiSocket.on("readable", drainEvents);
  eiSocket.unref();

  return true;
}

function drainEvents(): void {
  if (eiCtx === 0n) return;
  ei.ei_dispatch(eiCtx);
  while (true) {
    const event = ei.ei_get_event(eiCtx) as bigint;
    if (event === 0n) break;
    const etype = (ei.ei_event_get_type as any)(event) as number;
    if (etype === EI_DEVICE_PAUSED) {
      ready = false;
    } else if (etype === EI_DEVICE_RESUMED) {
      seq++;
      ei.ei_device_start_emulating(device, seq);
      ready = true;
    } else if (etype === EI_DEVICE_REMOVED || etype === EI_DISCONNECT) {
      ready = false;
      device = 0n;
    }
    ei.ei_event_unref(event);
  }
}

function emitFrame(): void {
  ei.ei_device_frame(device, ei.ei_now(eiCtx) as bigint);
}

// ── Command handlers ────────────────────────────────────────────────

function keyboard_press(keysym: number): void {
  const evdev = keysymToEvdev(keysym);
  if (evdev === null || !ready) return;
  ei.ei_device_keyboard_key(device, evdev, 1);
  emitFrame();
}

function keyboard_release(keysym: number): void {
  const evdev = keysymToEvdev(keysym);
  if (evdev === null || !ready) return;
  ei.ei_device_keyboard_key(device, evdev, 0);
  emitFrame();
}

function keyboard_getKeyState(_keysym: number): boolean {
  return false;
}

function mouse_press(button: number): void {
  const evdev = buttonToEvdev(button);
  if (evdev === null || !ready) return;
  ei.ei_device_button_button(device, evdev, 1);
  emitFrame();
}

function mouse_release(button: number): void {
  const evdev = buttonToEvdev(button);
  if (evdev === null || !ready) return;
  ei.ei_device_button_button(device, evdev, 0);
  emitFrame();
}

function mouse_scrollH(amount: number): void {
  if (!ready) return;
  ei.ei_device_scroll_discrete(device, amount * 120, 0);
  emitFrame();
}

function mouse_scrollV(amount: number): void {
  if (!ready) return;
  ei.ei_device_scroll_discrete(device, 0, amount * 120);
  emitFrame();
}

function mouse_getPos(): { x: number; y: number } {
  return { x: 0, y: 0 };
}

function mouse_setPos(x: number, y: number): void {
  if (!ready) return;
  ei.ei_device_pointer_motion_absolute(device, x, y);
  emitFrame();
}

function mouse_getButtonState(_button: number): boolean {
  return false;
}

// ── Worker message loop ─────────────────────────────────────────────

let initialized = false;
const ops: Record<string, (...args: any[]) => any> = {
  keyboard_press, keyboard_release, keyboard_getKeyState,
  mouse_press, mouse_release, mouse_scrollH, mouse_scrollV,
  mouse_getPos, mouse_setPos, mouse_getButtonState,
};

parentPort.on("message", (msg: { id: number; op: string; args: any[] }) => {
  if (!initialized) { initialized = true; init(); }
  const fn = ops[msg.op];
  if (!fn) {
    parentPort.postMessage({ id: msg.id, error: `unknown op: ${msg.op}` });
    return;
  }
  try {
    const result = fn(...(msg.args || []));
    parentPort.postMessage({ id: msg.id, result });
  } catch (err: any) {
    parentPort.postMessage({ id: msg.id, error: err?.message || String(err) });
  }
});
