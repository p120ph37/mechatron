////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Keyboard Test Module                           //
//                                                                            //
//  Exercises Keyboard class using the modern mechatron API.                  //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip) {

	async function waitForAsync(condFn, timeoutMs) {
		for (var elapsed = 0; elapsed < timeoutMs; elapsed += 5) {
			if (await condFn()) return true;
			await new Promise(function (r) { setTimeout(r, 5); });
		}
		return false;
	}

	async function testKeyboard() {
		log("  Keyboard... ");

		var Keyboard = mechatron.Keyboard;
		var KEYS = mechatron.KEYS;

		// --- compile (purely computational) ---
		var list = Keyboard.compile("{SPACE}");
		assert(list.length === 2, "compile SPACE length");
		assert(list[0].down === true, "compile SPACE [0].down");
		assert(list[0].key === KEYS.KEY_SPACE, "compile SPACE [0].key");
		assert(list[1].down === false, "compile SPACE [1].down");
		assert(list[1].key === KEYS.KEY_SPACE, "compile SPACE [1].key");

		list = Keyboard.compile("{TAB}{ESCAPE}");
		assert(list.length === 4, "compile TAB+ESC length");

		list = Keyboard.compile("{F1}{F2}{F3}{F4}{F5}{F6}{F7}{F8}{F9}{F10}{F11}{F12}");
		assert(list.length === 24, "compile F1-F12 length");

		// Modifier compile
		list = Keyboard.compile("{SHIFT}{CONTROL}{ALT}");
		assert(list.length === 6, "compile modifiers length");

		// Compile with repetition count
		list = Keyboard.compile("{SPACE 3}");
		assert(list.length === 6, "compile SPACE x3 length");

		// Compile plain characters
		list = Keyboard.compile("abc");
		assert(list.length === 6, "compile 'abc' length");

		// Compile modifier prefixes (+ = shift, ^ = ctrl, % = alt)
		list = Keyboard.compile("+a");
		assert(list.length >= 4, "compile +a has shift down+up + a down+up");
		// The first event should be shift down
		assert(list[0].down === true, "compile +a shift down first");

		// Compile with groups: modifier applied to group
		list = Keyboard.compile("+(ab)");
		assert(list !== null, "compile +(ab) not null");
		// shift down, a down/up, b down/up, shift up
		assert(list.length === 6, "compile +(ab) length");

		// Compile error cases (returns empty array)
		assert(Keyboard.compile("}").length === 0, "compile unmatched } empty");
		assert(Keyboard.compile("{").length === 0, "compile unmatched { empty");
		assert(Keyboard.compile("{NOTAKEY}").length === 0, "compile invalid key empty");
		assert(Keyboard.compile("(").length === 0, "compile unmatched ( empty");
		assert(Keyboard.compile(")").length === 0, "compile unmatched ) empty");

		// Compile whitespace (ignored)
		list = Keyboard.compile("\t\n");
		assert(list !== null && list.length === 0, "compile whitespace empty");

		// Compile repetition edge: 0 count
		list = Keyboard.compile("{SPACE 0}");
		assert(list !== null && list.length === 0, "compile SPACE x0 empty");

		if (!mechatron.isAvailable("keyboard")) {
			expectOrSkip("keyboardSim", "keyboard backend");
			log("(backend unavailable) OK\n");
			return true;
		}

		var k = new Keyboard();

		// --- autoDelay ---
		assert(k.autoDelay instanceof mechatron.Range, "autoDelay is Range");

		// --- click/press/release + getState ---
		await k.press(KEYS.KEY_SHIFT);
		var pressWorks = await waitForAsync(async function () {
			return (await Keyboard.getState(KEYS.KEY_SHIFT)) === true;
		}, 200);
		await k.release(KEYS.KEY_SHIFT);
		var releaseWorks = pressWorks && await waitForAsync(async function () {
			return (await Keyboard.getState(KEYS.KEY_SHIFT)) === false;
		}, 200);
		if (releaseWorks) {
			await k.click(KEYS.KEY_SHIFT);
			assert(await waitForAsync(async function () {
				return (await Keyboard.getState(KEYS.KEY_SHIFT)) === false;
			}, 200), "shift released after click");

			await k.press(KEYS.KEY_SHIFT);
			assert(await waitForAsync(async function () {
				return (await Keyboard.getState(KEYS.KEY_SHIFT)) === true;
			}, 200), "shift pressed");
			await k.release(KEYS.KEY_SHIFT);
			assert(await waitForAsync(async function () {
				return (await Keyboard.getState(KEYS.KEY_SHIFT)) === false;
			}, 200), "shift released");
		} else {
			expectOrSkip("keyboardSim", "Keyboard input simulation");
			log("(input sim unavailable) ");
		}

		// --- getState() returns object ---
		var state = await Keyboard.getState();
		assert(typeof state === "object", "getState returns object");

		// --- KEYS record ---
		assert(typeof KEYS === "object", "KEYS is object");
		assert(typeof KEYS.KEY_SPACE === "number", "KEY_SPACE is number");
		assert(typeof KEYS.KEY_A === "number", "KEY_A is number");
		assert(typeof KEYS.KEY_SHIFT === "number", "KEY_SHIFT is number");
		assert(typeof KEYS.KEY_CONTROL === "number", "KEY_CONTROL is number");
		assert(typeof KEYS.KEY_ALT === "number", "KEY_ALT is number");

		// --- clone ---
		var kc = k.clone();
		assert(kc.autoDelay instanceof mechatron.Range, "clone autoDelay");

		// --- copy constructor ---
		var kCopy = new Keyboard(k);
		assert(kCopy.autoDelay instanceof mechatron.Range, "copy ctor autoDelay");

		// --- getState() without keycode (returns full state object) ---
		var kState = await Keyboard.getState();
		assert(typeof kState === "object", "getState() returns object");

		// --- click with string key (exercises string click overload) ---
		if (releaseWorks) {
			await k.click("{SPACE}");
			assert(await waitForAsync(async function () {
				return (await Keyboard.getState(KEYS.KEY_SPACE)) === false;
			}, 200), "click string SPACE released");

			await k.click("a");
			assert(await waitForAsync(async function () {
				return (await Keyboard.getState(KEYS.KEY_A)) === false;
			}, 200), "click string 'a' released");
		}

		// --- getAllKeys / getKeyNames ---
		var allKeys = mechatron.getAllKeys();
		assert(allKeys.length > 0, "getAllKeys non-empty");
		var keyNames = mechatron.getKeyNames();
		assert(Object.keys(keyNames).length > 0, "getKeyNames non-empty");

		log("OK\n");
		return true;
	}

	return {
		testKeyboard: testKeyboard,
	};
};
