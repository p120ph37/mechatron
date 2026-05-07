////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron uinput Test Module                            //
//                                                                            //
//  Pure-TS exercises of lib/input/uinput.ts: keysym→evdev mapping and        //
//  byte-level encoding of input_event / uinput_setup / uinput_abs_setup      //
//  structs.  These layouts must match the Linux kernel's <linux/uinput.h>    //
//  ABI exactly — a one-byte offset error here would not be caught by the     //
//  end-to-end tests on linux-nolib[vt], because the kernel would silently    //
//  accept malformed events.  Pure JS, runs on every platform.                //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor) {

	function testUinput() {
		log("  uinput... ");

		var ui = require("../lib/input/uinput");

		// ── Keysym → evdev mapping ──────────────────────────────────
		// Spot-check that the X11 keysym → Linux evdev code mapping
		// produces the expected values for representative keys.  Use
		// hardcoded X11 keysyms (not mechatron.KEYS, which is the
		// public per-platform table — only Linux uses X11 keysyms;
		// Windows uses Win32 VK codes, macOS uses Carbon HID codes).
		assert(ui.mapKeysymToKeycode(0x0061) === 30, "X11 'a' → 30");
		assert(ui.mapKeysymToKeycode(0x007A) === 44, "X11 'z' → 44");
		assert(ui.mapKeysymToKeycode(0x0030) === 11, "X11 '0' → 11");
		assert(ui.mapKeysymToKeycode(0x0031) === 2,  "X11 '1' → 2");
		assert(ui.mapKeysymToKeycode(0x0020) === 57, "X11 SPACE → 57");
		assert(ui.mapKeysymToKeycode(0xFF0D) === 28, "X11 RETURN → 28");
		assert(ui.mapKeysymToKeycode(0xFF1B) === 1,  "X11 ESCAPE → 1");
		assert(ui.mapKeysymToKeycode(0xFFBE) === 59, "X11 F1 → 59");
		assert(ui.mapKeysymToKeycode(0xFFC9) === 88, "X11 F12 → 88");
		assert(ui.mapKeysymToKeycode(0xFFE1) === 42, "X11 LSHIFT → 42");
		assert(ui.mapKeysymToKeycode(0xFFE2) === 54, "X11 RSHIFT → 54");
		assert(ui.mapKeysymToKeycode(0xFFE3) === 29, "X11 LCTRL → 29");
		assert(ui.mapKeysymToKeycode(0xFFE4) === 97, "X11 RCTRL → 97");
		assert(ui.mapKeysymToKeycode(0xFFE9) === 56, "X11 LALT → 56");
		assert(ui.mapKeysymToKeycode(0xFFEA) === 100, "X11 RALT → 100");
		assert(ui.mapKeysymToKeycode(0xFFEB) === 125, "X11 LSUPER → 125");
		assert(ui.mapKeysymToKeycode(0xFFEC) === 126, "X11 RSUPER → 126");
		assert(ui.mapKeysymToKeycode(0xFFE5) === 58, "X11 CAPS → 58");
		assert(ui.mapKeysymToKeycode(0xFF7F) === 69, "X11 NUM_LOCK → 69");
		assert(ui.mapKeysymToKeycode(0xFF14) === 70, "X11 SCROLL_LOCK → 70");
		assert(ui.mapKeysymToKeycode(0xFFB0) === 82, "X11 KP_0 → 82");
		assert(ui.mapKeysymToKeycode(0xFFB9) === 73, "X11 KP_9 → 73");
		assert(ui.mapKeysymToKeycode(0xFFAB) === 78, "X11 KP_ADD → 78");
		assert(ui.mapKeysymToKeycode(0xFF8D) === 96, "X11 KP_ENTER → 96");
		assert(ui.mapKeysymToKeycode(0xFF52) === 103, "X11 UP → 103");
		assert(ui.mapKeysymToKeycode(0xFF54) === 108, "X11 DOWN → 108");
		assert(ui.mapKeysymToKeycode(0xFF51) === 105, "X11 LEFT → 105");
		assert(ui.mapKeysymToKeycode(0xFF53) === 106, "X11 RIGHT → 106");
		assert(ui.mapKeysymToKeycode(0xFF50) === 102, "X11 HOME → 102");
		assert(ui.mapKeysymToKeycode(0xFF57) === 107, "X11 END → 107");
		assert(ui.mapKeysymToKeycode(0xFF55) === 104, "X11 PG_UP → 104");
		assert(ui.mapKeysymToKeycode(0xFF56) === 109, "X11 PG_DOWN → 109");
		assert(ui.mapKeysymToKeycode(0xFF63) === 110, "X11 INSERT → 110");
		assert(ui.mapKeysymToKeycode(0xFFFF) === 111, "X11 DELETE → 111");
		assert(ui.mapKeysymToKeycode(0xFF09) === 15, "X11 TAB → 15");
		assert(ui.mapKeysymToKeycode(0xFF08) === 14, "X11 BKSP → 14");

		// Unknown keysyms return 0 (caller should skip).
		assert(ui.mapKeysymToKeycode(0) === 0, "keysym 0 → 0");
		assert(ui.mapKeysymToKeycode(0xFFFE) === 0, "unknown keysym → 0");

		// ── allSupportedEvdevCodes invariants ────────────────────────
		var codes = ui.allSupportedEvdevCodes();
		assert(Array.isArray(codes), "allSupportedEvdevCodes returns array");
		assert(codes.length > 50, "supported code list non-trivial (got " + codes.length + ")");
		for (var i = 1; i < codes.length; i++) {
			assert(codes[i] > codes[i - 1], "codes strictly sorted & deduped");
		}
		assert(codes.indexOf(ui.BTN_LEFT) >= 0, "BTN_LEFT included");
		assert(codes.indexOf(ui.BTN_RIGHT) >= 0, "BTN_RIGHT included");
		assert(codes.indexOf(ui.BTN_MIDDLE) >= 0, "BTN_MIDDLE included");
		assert(codes.indexOf(30) >= 0, "KEY_A included");

		// ── encodeInputEvent (struct input_event, 24 bytes) ──────────
		// Use a deterministic timestamp so the output is byte-stable.
		var ts = 1_700_000_000_123; // ms since epoch; .123 → 123000 usec
		var ev = ui.encodeInputEvent(ui.EV_KEY, 30 /* KEY_A */, 1, ts);
		assert(ev.length === 24, "input_event length 24");
		assert(ev.readBigInt64LE(0) === 1700000000n, "tv_sec");
		assert(ev.readBigInt64LE(8) === 123000n, "tv_usec");
		assert(ev.readUInt16LE(16) === ui.EV_KEY, "type");
		assert(ev.readUInt16LE(18) === 30, "code");
		assert(ev.readInt32LE(20) === 1, "value");

		// Negative values (release = value 0, but REL_Y dy = -5 is a common case)
		var relEv = ui.encodeInputEvent(ui.EV_REL, ui.REL_Y, -5, 0);
		assert(relEv.readInt32LE(20) === -5, "negative value round-trips");
		assert(relEv.readBigInt64LE(0) === 0n, "ts=0 tv_sec");
		assert(relEv.readBigInt64LE(8) === 0n, "ts=0 tv_usec");

		// Event with code overflow (shouldn't happen, but mask should apply)
		var mask = ui.encodeInputEvent(0x10001, 0x20002, 0, 0);
		assert(mask.readUInt16LE(16) === 1, "type masked to u16");
		assert(mask.readUInt16LE(18) === 2, "code masked to u16");

		// Default timestamp: just confirm it doesn't throw and is recent.
		var now = ui.encodeInputEvent(ui.EV_SYN, ui.SYN_REPORT, 0);
		var nowSec = Number(now.readBigInt64LE(0));
		var wallSec = Math.floor(Date.now() / 1000);
		assert(Math.abs(nowSec - wallSec) < 5, "default ts ≈ wall clock");

		// ── encodeUinputSetup (struct uinput_setup, 92 bytes) ────────
		var setup = ui.encodeUinputSetup("mechatron-virtual", {
			bustype: ui.BUS_VIRTUAL, vendor: 0x1209, product: 0x7070, version: 1,
		});
		assert(setup.length === 92, "uinput_setup length 92");
		assert(setup.readUInt16LE(0) === ui.BUS_VIRTUAL, "bustype");
		assert(setup.readUInt16LE(2) === 0x1209, "vendor");
		assert(setup.readUInt16LE(4) === 0x7070, "product");
		assert(setup.readUInt16LE(6) === 1, "version");
		// name @ 8..88, NUL-padded
		var nameStr = setup.toString("utf8", 8, 8 + "mechatron-virtual".length);
		assert(nameStr === "mechatron-virtual", "name round-trips");
		assert(setup[8 + "mechatron-virtual".length] === 0, "name NUL-terminated");
		assert(setup.readUInt32LE(88) === 0, "ff_effects_max default 0");

		// Over-length name gets truncated at 79 bytes + NUL.
		var longName = "x".repeat(200);
		var longSetup = ui.encodeUinputSetup(longName);
		assert(longSetup.length === 92, "long-name setup still 92 bytes");
		// byte 87 is the 80th name byte; should be NUL since we only copied 79.
		assert(longSetup[8 + 79] === 0, "long name truncated with NUL at +79");
		assert(longSetup[8 + 78] === "x".charCodeAt(0), "last written byte is 'x'");

		// Defaults filled in when options omitted.
		var defSetup = ui.encodeUinputSetup("dflt");
		assert(defSetup.readUInt16LE(0) === ui.BUS_VIRTUAL, "default bustype");
		assert(defSetup.readUInt16LE(2) === 0x1209, "default vendor");
		assert(defSetup.readUInt16LE(4) === 0x7070, "default product");
		assert(defSetup.readUInt16LE(6) === 1, "default version");

		// ff_effects_max override
		var ffSetup = ui.encodeUinputSetup("ff", { ffEffectsMax: 7 });
		assert(ffSetup.readUInt32LE(88) === 7, "ff_effects_max override");

		// ── encodeAbsSetup (struct uinput_abs_setup, 28 bytes) ──────
		var absSetup = ui.encodeAbsSetup(ui.ABS_X, { minimum: 0, maximum: 65535, resolution: 1 });
		assert(absSetup.length === 28, "uinput_abs_setup length 28");
		assert(absSetup.readUInt16LE(0) === ui.ABS_X, "abs code");
		assert(absSetup.readInt32LE(4) === 0, "abs initial value");
		assert(absSetup.readInt32LE(8) === 0, "abs minimum");
		assert(absSetup.readInt32LE(12) === 65535, "abs maximum");
		assert(absSetup.readInt32LE(16) === 0, "abs fuzz");
		assert(absSetup.readInt32LE(20) === 0, "abs flat");
		assert(absSetup.readInt32LE(24) === 1, "abs resolution");

		// Default values
		var absDefSetup = ui.encodeAbsSetup(ui.ABS_Y);
		assert(absDefSetup.readUInt16LE(0) === ui.ABS_Y, "abs Y code");
		assert(absDefSetup.readInt32LE(8) === 0, "abs Y default min");
		assert(absDefSetup.readInt32LE(12) === 0, "abs Y default max");
		assert(absDefSetup.readInt32LE(16) === 0, "abs Y default fuzz");
		assert(absDefSetup.readInt32LE(20) === 0, "abs Y default flat");
		assert(absDefSetup.readInt32LE(24) === 0, "abs Y default resolution");

		// ── encodeEventBurst (concatenation + trailing SYN_REPORT) ───
		var burst = ui.encodeEventBurst([
			{ type: ui.EV_KEY, code: 30, value: 1 },
			{ type: ui.EV_KEY, code: 30, value: 0 },
		], ts);
		assert(burst.length === 24 * 3, "burst length = 3 events × 24");
		// Event 0: KEY_A press
		assert(burst.readUInt16LE(16) === ui.EV_KEY, "burst[0] type");
		assert(burst.readUInt16LE(18) === 30, "burst[0] code");
		assert(burst.readInt32LE(20) === 1, "burst[0] value");
		// Event 1: KEY_A release
		assert(burst.readUInt16LE(24 + 16) === ui.EV_KEY, "burst[1] type");
		assert(burst.readInt32LE(24 + 20) === 0, "burst[1] value");
		// Event 2: SYN_REPORT
		assert(burst.readUInt16LE(48 + 16) === ui.EV_SYN, "burst[2] SYN type");
		assert(burst.readUInt16LE(48 + 18) === ui.SYN_REPORT, "burst[2] SYN code");
		// All events share the timestamp passed in.
		assert(burst.readBigInt64LE(0) === 1700000000n, "burst[0] ts");
		assert(burst.readBigInt64LE(24) === 1700000000n, "burst[1] ts");
		assert(burst.readBigInt64LE(48) === 1700000000n, "burst[2] ts");

		// Empty burst still emits a lone SYN_REPORT (useful for flushing).
		var synOnly = ui.encodeEventBurst([], 0);
		assert(synOnly.length === 24, "empty burst → lone SYN");
		assert(synOnly.readUInt16LE(16) === ui.EV_SYN, "lone SYN type");
		assert(synOnly.readUInt16LE(18) === ui.SYN_REPORT, "lone SYN code");

		log("OK\n");
		return true;
	}

	return [
		{ name: "uinput", functions: [], unit: true, test: testUinput },
	];
};
