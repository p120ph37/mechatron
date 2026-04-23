////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron uinput Test Module                            //
//                                                                            //
//  Pure-TS exercises of lib/input/uinput.ts: keysym→evdev mapping, event     //
//  and setup-struct buffer encoding.  Integration tests against a real       //
//  /dev/uinput device live separately and skip when the device isn't         //
//  writable (requires root or the `input` group).                            //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor) {

	function testUinput() {
		log("  uinput... ");

		// Only meaningful on Linux — the encoding functions are present
		// everywhere (pure JS), but the keycode table is Linux-specific.
		if (process.platform !== "linux") {
			log("SKIP (not Linux)\n");
			return true;
		}

		// Load the module directly so tests attribute coverage to
		// lib/input/uinput.ts (the public API doesn't re-export these
		// helpers because they're an implementation detail — users go
		// through Keyboard/Mouse).
		var ui = require("../lib/input/uinput");

		// ── Constants sanity check ──────────────────────────────────
		// ioctl numbers are derived from <linux/uinput.h>; confirm the
		// ones we care about match the kernel's _IOC_NONE / _IOW macros
		// for the standard Linux arches (x86_64, aarch64, arm, riscv64).
		assert(ui.UI_DEV_CREATE === 0x5501, "UI_DEV_CREATE value");
		assert(ui.UI_DEV_DESTROY === 0x5502, "UI_DEV_DESTROY value");
		assert(ui.UI_SET_EVBIT === 0x40045564, "UI_SET_EVBIT value");
		assert(ui.UI_SET_KEYBIT === 0x40045565, "UI_SET_KEYBIT value");
		assert(ui.UI_SET_RELBIT === 0x40045566, "UI_SET_RELBIT value");
		// _IOW('U', 3, sizeof(uinput_setup)=92) = 0x405c5503
		assert(ui.UI_DEV_SETUP === 0x405c5503, "UI_DEV_SETUP value");

		// Event type codes from <linux/input-event-codes.h>
		assert(ui.EV_SYN === 0x00, "EV_SYN");
		assert(ui.EV_KEY === 0x01, "EV_KEY");
		assert(ui.EV_REL === 0x02, "EV_REL");
		assert(ui.SYN_REPORT === 0, "SYN_REPORT");
		assert(ui.REL_X === 0x00 && ui.REL_Y === 0x01, "REL_X/Y");
		assert(ui.REL_WHEEL === 0x08, "REL_WHEEL");
		assert(ui.REL_HWHEEL === 0x06, "REL_HWHEEL");
		assert(ui.EV_ABS === 0x03, "EV_ABS");
		assert(ui.ABS_X === 0x00, "ABS_X");
		assert(ui.ABS_Y === 0x01, "ABS_Y");
		assert(ui.UI_SET_ABSBIT === 0x40045567, "UI_SET_ABSBIT value");
		assert(ui.UI_ABS_SETUP === 0x401c5504, "UI_ABS_SETUP value");
		assert(ui.BTN_LEFT === 0x110, "BTN_LEFT");
		assert(ui.BTN_RIGHT === 0x111, "BTN_RIGHT");
		assert(ui.BTN_MIDDLE === 0x112, "BTN_MIDDLE");
		assert(ui.BUS_VIRTUAL === 0x06, "BUS_VIRTUAL");

		// ── Keysym → evdev mapping ──────────────────────────────────
		// Every mechatron-public KEYS.* entry on Linux should either
		// map to a non-zero evdev code or be intentionally absent
		// (with rationale documented).  Spot-check a cross-section.
		var KEYS = mechatron.KEYS;
		assert(ui.mapKeysymToKeycode(KEYS.KEY_A) === 30, "KEY_A → 30");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_Z) === 44, "KEY_Z → 44");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_0) === 11, "KEY_0 → 11");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_1) === 2,  "KEY_1 → 2");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_SPACE) === 57, "SPACE → 57");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_RETURN) === 28, "RETURN → 28");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_ESCAPE) === 1, "ESC → 1");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_F1) === 59, "F1 → 59");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_F12) === 88, "F12 → 88");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_LSHIFT) === 42, "LSHIFT → 42");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_RSHIFT) === 54, "RSHIFT → 54");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_LCONTROL) === 29, "LCTRL → 29");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_RCONTROL) === 97, "RCTRL → 97");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_LALT) === 56, "LALT → 56");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_RALT) === 100, "RALT → 100");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_LSYSTEM) === 125, "LSUPER → 125");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_RSYSTEM) === 126, "RSUPER → 126");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_CAPS_LOCK) === 58, "CAPS → 58");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_NUM_LOCK) === 69, "NUM_LOCK → 69");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_SCROLL_LOCK) === 70, "SCROLL_LOCK → 70");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_NUM0) === 82, "KP0 → 82");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_NUM9) === 73, "KP9 → 73");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_ADD) === 78, "KP_ADD → 78");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_ENTER) === 96, "KP_ENTER → 96");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_UP) === 103, "UP → 103");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_DOWN) === 108, "DOWN → 108");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_LEFT) === 105, "LEFT → 105");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_RIGHT) === 106, "RIGHT → 106");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_HOME) === 102, "HOME → 102");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_END) === 107, "END → 107");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_PAGE_UP) === 104, "PG_UP → 104");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_PAGE_DOWN) === 109, "PG_DOWN → 109");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_INSERT) === 110, "INSERT → 110");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_DELETE) === 111, "DELETE → 111");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_TAB) === 15, "TAB → 15");
		assert(ui.mapKeysymToKeycode(KEYS.KEY_BACKSPACE) === 14, "BKSP → 14");

		// Every KeyTable entry should map to a non-zero evdev code.
		// Guards against accidentally deleting a row from KEYSYM_TO_EVDEV
		// when adding a new mechatron KEYS entry.
		Object.keys(KEYS).forEach(function (k) {
			if (k.indexOf("KEY_") !== 0) return;
			var sym = KEYS[k];
			var code = ui.mapKeysymToKeycode(sym);
			assert(code > 0, "keysym map missing for " + k + " (sym=0x" + sym.toString(16) + ")");
		});

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

		// ── Probe semantics ──────────────────────────────────────────
		var probe = ui.openUinputForProbe();
		assert(typeof probe === "object" && "ok" in probe, "probe returns {ok,...}");
		assert(typeof probe.ok === "boolean", "probe.ok boolean");
		if (!probe.ok) {
			assert(typeof probe.reason === "string" && probe.reason.length > 0,
				"probe failure includes a reason");
		}

		// uinputAvailable() is a cheap probe — should agree with
		// openUinputForProbe().ok (same syscall, no device creation).
		assert(ui.uinputAvailable() === probe.ok,
			"uinputAvailable matches probe.ok");

		// ── FFI layer (lib/ffi/uinput.ts) ────────────────────────────
		// The ioctl-based device lifecycle requires bun:ffi.  On Node
		// the module loads cleanly (just can't open libc) and every
		// injection helper returns false.  On Bun with /dev/uinput
		// writable the full create+write path runs; without it, the
		// open diagnostic string should be non-empty.
		var ffi = require("../lib/ffi/uinput");
		assert(typeof ffi.getUinputDevice === "function", "ffi.getUinputDevice");
		assert(typeof ffi.uinputReady === "function", "ffi.uinputReady");
		assert(typeof ffi.uinputOpenReason === "function", "ffi.uinputOpenReason");
		assert(typeof ffi.injectKeysym === "function", "ffi.injectKeysym");
		assert(typeof ffi.injectMouseButton === "function", "ffi.injectMouseButton");
		assert(typeof ffi.injectScrollV === "function", "ffi.injectScrollV");
		assert(typeof ffi.injectScrollH === "function", "ffi.injectScrollH");
		assert(typeof ffi.injectAbsMotion === "function", "ffi.injectAbsMotion");
		assert(ffi.UINPUT_ABS_MAX === 65535, "UINPUT_ABS_MAX value");
		assert(typeof ffi.closeUinputDevice === "function", "ffi.closeUinputDevice");

		var ready = ffi.uinputReady();
		assert(typeof ready === "boolean", "uinputReady boolean");
		if (!ready) {
			// Diagnostic string must be populated on failure so operators
			// can tell "why not" without running strace.
			var reason = ffi.uinputOpenReason();
			assert(typeof reason === "string" && reason.length > 0,
				"uinputOpenReason populated when not ready (got " + JSON.stringify(reason) + ")");
			// All injection helpers short-circuit to false when the
			// device isn't available — they must NOT throw.
			assert(ffi.injectKeysym(KEYS.KEY_A, true) === false, "injectKeysym false when !ready");
			assert(ffi.injectMouseButton(0, true) === false, "injectMouseButton false when !ready");
			assert(ffi.injectScrollV(1) === false, "injectScrollV false when !ready");
			assert(ffi.injectScrollH(1) === false, "injectScrollH false when !ready");
			// closeUinputDevice is a no-op when there's no device.
			ffi.closeUinputDevice();
		} else {
			// Live-device smoke tests: each injection is a best-effort
			// write; "true" just means the syscall didn't error.  We
			// don't read back via evdev here because that requires
			// privileges beyond what `input` group gives us and would
			// race against the compositor's grab.
			log("(live uinput) ");
			assert(ffi.injectKeysym(KEYS.KEY_LSHIFT, true) === true, "LSHIFT press accepted");
			assert(ffi.injectKeysym(KEYS.KEY_LSHIFT, false) === true, "LSHIFT release accepted");
			// Unmapped keysym: short-circuits false without writing.
			assert(ffi.injectKeysym(0xFFFE, true) === false, "unknown keysym returns false");
			assert(ffi.injectMouseButton(0, true) === true, "BTN_LEFT press accepted");
			assert(ffi.injectMouseButton(0, false) === true, "BTN_LEFT release accepted");
			assert(ffi.injectMouseButton(99, true) === false, "out-of-range button false");
			assert(ffi.injectScrollV(1) === true, "scrollV +1 accepted");
			assert(ffi.injectScrollV(0) === true, "scrollV 0 no-op");
			assert(ffi.injectScrollH(-1) === true, "scrollH -1 accepted");
			assert(ffi.injectScrollH(0) === true, "scrollH 0 no-op");
			assert(ffi.injectAbsMotion(32768, 32768) === true, "absMotion center accepted");
			assert(ffi.injectAbsMotion(0, 0) === true, "absMotion origin accepted");
			// Tear down explicitly so process exit doesn't leak the device.
			ffi.closeUinputDevice();
			// After close, getUinputDevice returns null (re-open is
			// guarded by _openAttempted; a second probe gets null+null).
			assert(ffi.uinputReady() === false, "uinputReady false after close");
		}

		// ── Platform mechanism plumbing ──────────────────────────────
		// Keyboard/Mouse dispatch consults Platform.getMechanism("input")
		// on each call; verify that the mechanism registry knows about
		// uinput, that pinning it works, and that Keyboard.press /
		// Mouse.press don't throw when it's the selected mechanism —
		// regardless of whether the device is actually live (dispatcher
		// falls through to XTest when uinput isn't ready).
		if (!mechatron.isAvailable("keyboard")) {
			log("(keyboard unavailable, skipping mechanism tests) OK\n");
			return true;
		}

		var infos = mechatron.listMechanisms("input");
		assert(Array.isArray(infos), "listMechanisms returns array");
		var uinputInfo = infos.find(function (m) { return m.name === "uinput"; });
		assert(uinputInfo, "uinput mechanism registered");
		assert(typeof uinputInfo.available === "boolean", "uinput.available boolean");
		var xtestInfo = infos.find(function (m) { return m.name === "xtest"; });
		assert(xtestInfo, "xtest mechanism registered");

		// Pinning uinput: honoured even when unavailable so auto-detect
		// doesn't silently pick xtest behind the user's back.
		var prevActive = mechatron.getMechanism("input");
		mechatron.setMechanism("input", "uinput");
		assert(mechatron.getMechanism("input") === "uinput",
			"setMechanism input=uinput sticks");

		// Keyboard.press/release under uinput pin.  When uinput isn't
		// ready the dispatcher silently falls through to XTest, so this
		// just verifies no exception escapes.  We only attempt this if
		// an XTest fallback is actually available — otherwise the whole
		// call becomes a no-op but importing mechanism would still have
		// been exercised.
		var kb = new mechatron.Keyboard();
		var mouse = new mechatron.Mouse();
		try {
			kb.press(KEYS.KEY_LSHIFT);
			kb.release(KEYS.KEY_LSHIFT);
		} catch (e) {
			assert(false, "Keyboard under uinput pin threw: " + e.message);
		}

		// Mouse buttons + scroll under uinput pin.  setPos uses EV_ABS
		// through uinput (emulated digitizer) when uinput is selected,
		// falling back to XWarpPointer if the coordinate mapping fails.
		try {
			mouse.press(mechatron.BUTTON_LEFT);
			mouse.release(mechatron.BUTTON_LEFT);
			mouse.scrollV(1);
			mouse.scrollH(-1);
		} catch (e) {
			assert(false, "Mouse ops under uinput pin threw: " + e.message);
		}

		// Restore prior selection so later tests aren't affected.
		if (prevActive) {
			mechatron.setMechanism("input", prevActive);
		} else {
			mechatron.resetMechanism("input");
		}

		log("OK\n");
		return true;
	}

	return [
		{ name: "uinput", functions: [], test: testUinput },
	];
};
