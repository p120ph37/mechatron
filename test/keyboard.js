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

	function testKeyboard() {
		log("  Keyboard... ");

		var Keyboard = mechatron.Keyboard;
		var KEYS = mechatron.KEYS;
		var k = new Keyboard();

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

		// --- autoDelay ---
		assert(k.autoDelay instanceof mechatron.Range, "autoDelay is Range");

		// --- click/press/release + getState ---
		k.press(KEYS.KEY_SHIFT);
		var pressWorks = waitFor(function () {
			return Keyboard.getState(KEYS.KEY_SHIFT) === true;
		}, 200);
		k.release(KEYS.KEY_SHIFT);
		var releaseWorks = pressWorks && waitFor(function () {
			return Keyboard.getState(KEYS.KEY_SHIFT) === false;
		}, 200);
		if (releaseWorks) {
			k.click(KEYS.KEY_SHIFT);
			assert(waitFor(function () {
				return Keyboard.getState(KEYS.KEY_SHIFT) === false;
			}, 200), "shift released after click");

			k.press(KEYS.KEY_SHIFT);
			assert(waitFor(function () {
				return Keyboard.getState(KEYS.KEY_SHIFT) === true;
			}, 200), "shift pressed");
			k.release(KEYS.KEY_SHIFT);
			assert(waitFor(function () {
				return Keyboard.getState(KEYS.KEY_SHIFT) === false;
			}, 200), "shift released");
		} else {
			expectOrSkip("keyboardSim", "Keyboard input simulation");
			log("(input sim unavailable) ");
		}

		// --- getState() returns object ---
		var state = Keyboard.getState();
		assert(typeof state === "object", "getState returns object");

		// --- KEYS record ---
		assert(typeof KEYS === "object", "KEYS is object");
		assert(typeof KEYS.KEY_SPACE === "number", "KEY_SPACE is number");
		assert(typeof KEYS.KEY_A === "number", "KEY_A is number");
		assert(typeof KEYS.KEY_SHIFT === "number", "KEY_SHIFT is number");
		assert(typeof KEYS.KEY_CONTROL === "number", "KEY_CONTROL is number");
		assert(typeof KEYS.KEY_ALT === "number", "KEY_ALT is number");

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
