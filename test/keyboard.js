////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Keyboard Test Module                           //
//                                                                            //
//  Returns an array of annotated test entries.  Each entry declares the      //
//  COMPATIBILITY.md function names it depends on so the runner can skip      //
//  tests whose backend/platform cell is not "ok".                            //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor) {

	async function waitForAsync(condFn, timeoutMs) {
		for (var elapsed = 0; elapsed < timeoutMs; elapsed += 5) {
			if (await condFn()) return true;
			await new Promise(function (r) { setTimeout(r, 5); });
		}
		return false;
	}

	var Keyboard = mechatron.Keyboard;
	var KEYS = mechatron.KEYS;

	return [
		// ── purely computational: Keyboard.compile ──────────────────────

		{
			name: "compile SPACE",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("{SPACE}");
				assert(list.length === 2, "compile SPACE length");
				assert(list[0].down === true, "compile SPACE [0].down");
				assert(list[0].key === KEYS.KEY_SPACE, "compile SPACE [0].key");
				assert(list[1].down === false, "compile SPACE [1].down");
				assert(list[1].key === KEYS.KEY_SPACE, "compile SPACE [1].key");
			},
		},

		{
			name: "compile TAB+ESC",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("{TAB}{ESCAPE}");
				assert(list.length === 4, "compile TAB+ESC length");
			},
		},

		{
			name: "compile F1-F12",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("{F1}{F2}{F3}{F4}{F5}{F6}{F7}{F8}{F9}{F10}{F11}{F12}");
				assert(list.length === 24, "compile F1-F12 length");
			},
		},

		{
			name: "compile modifiers",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("{SHIFT}{CONTROL}{ALT}");
				assert(list.length === 6, "compile modifiers length");
			},
		},

		{
			name: "compile SPACE repetition",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("{SPACE 3}");
				assert(list.length === 6, "compile SPACE x3 length");
			},
		},

		{
			name: "compile plain characters",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("abc");
				assert(list.length === 6, "compile 'abc' length");
			},
		},

		{
			name: "compile modifier prefix +a",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("+a");
				assert(list.length >= 4, "compile +a has shift down+up + a down+up");
				assert(list[0].down === true, "compile +a shift down first");
			},
		},

		{
			name: "compile modifier group +(ab)",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("+(ab)");
				assert(list !== null, "compile +(ab) not null");
				assert(list.length === 6, "compile +(ab) length");
			},
		},

		{
			name: "compile error cases",
			functions: ["keyboard_ctor"],
			test: async function () {
				assert(Keyboard.compile("}").length === 0, "compile unmatched } empty");
				assert(Keyboard.compile("{").length === 0, "compile unmatched { empty");
				assert(Keyboard.compile("{NOTAKEY}").length === 0, "compile invalid key empty");
				assert(Keyboard.compile("(").length === 0, "compile unmatched ( empty");
				assert(Keyboard.compile(")").length === 0, "compile unmatched ) empty");
			},
		},

		{
			name: "compile whitespace",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("\t\n");
				assert(list !== null && list.length === 0, "compile whitespace empty");
			},
		},

		{
			name: "compile repetition zero",
			functions: ["keyboard_ctor"],
			test: async function () {
				var list = Keyboard.compile("{SPACE 0}");
				assert(list !== null && list.length === 0, "compile SPACE x0 empty");
			},
		},

		// ── KEYS record checks ──────────────────────────────────────────

		{
			name: "KEYS record",
			functions: ["keyboard_ctor"],
			test: async function () {
				assert(typeof KEYS === "object", "KEYS is object");
				assert(typeof KEYS.KEY_SPACE === "number", "KEY_SPACE is number");
				assert(typeof KEYS.KEY_A === "number", "KEY_A is number");
				assert(typeof KEYS.KEY_SHIFT === "number", "KEY_SHIFT is number");
				assert(typeof KEYS.KEY_CONTROL === "number", "KEY_CONTROL is number");
				assert(typeof KEYS.KEY_ALT === "number", "KEY_ALT is number");
			},
		},

		// ── getAllKeys / getKeyNames ─────────────────────────────────────

		{
			name: "getAllKeys and getKeyNames",
			functions: ["keyboard_ctor"],
			test: async function () {
				var allKeys = mechatron.getAllKeys();
				assert(allKeys.length > 0, "getAllKeys non-empty");
				var keyNames = mechatron.getKeyNames();
				assert(Object.keys(keyNames).length > 0, "getKeyNames non-empty");
			},
		},

		// ── instance construction (no backend calls) ────────────────────

		{
			name: "autoDelay is Range",
			functions: ["keyboard_ctor"],
			test: async function () {
				var k = new Keyboard();
				assert(k.autoDelay instanceof mechatron.Range, "autoDelay is Range");
			},
		},

		{
			name: "clone",
			functions: ["keyboard_ctor"],
			test: async function () {
				var k = new Keyboard();
				var kc = k.clone();
				assert(kc.autoDelay instanceof mechatron.Range, "clone autoDelay");
			},
		},

		{
			name: "copy constructor",
			functions: ["keyboard_ctor"],
			test: async function () {
				var k = new Keyboard();
				var kCopy = new Keyboard(k);
				assert(kCopy.autoDelay instanceof mechatron.Range, "copy ctor autoDelay");
			},
		},

		// ── getState without keycode ────────────────────────────────────

		{
			name: "getState returns object",
			functions: ["keyboard_getKeyState"],
			test: async function () {
				var state = await Keyboard.getState();
				assert(typeof state === "object", "getState returns object");
			},
		},

		{
			name: "getState without keycode returns object",
			functions: ["keyboard_getKeyState"],
			test: async function () {
				var kState = await Keyboard.getState();
				assert(typeof kState === "object", "getState() returns object");
			},
		},

		// ── press + getState round-trip ─────────────────────────────────

		{
			name: "press + getState",
			functions: ["keyboard_press", "keyboard_getKeyState"],
			test: async function () {
				var k = new Keyboard();
				try {
					await k.press(KEYS.KEY_SHIFT);
					assert(await waitForAsync(async function () {
						return (await Keyboard.getState(KEYS.KEY_SHIFT)) === true;
					}, 200), "shift pressed in state");
				} finally {
					await k.release(KEYS.KEY_SHIFT);
				}
			},
		},

		// ── release + getState ──────────────────────────────────────────

		{
			name: "release + getState",
			functions: ["keyboard_press", "keyboard_release", "keyboard_getKeyState"],
			test: async function () {
				var k = new Keyboard();
				await k.press(KEYS.KEY_SHIFT);
				await waitForAsync(async function () {
					return (await Keyboard.getState(KEYS.KEY_SHIFT)) === true;
				}, 200);
				await k.release(KEYS.KEY_SHIFT);
				assert(await waitForAsync(async function () {
					return (await Keyboard.getState(KEYS.KEY_SHIFT)) === false;
				}, 200), "shift released in state");
			},
		},

		// ── click + getState ────────────────────────────────────────────

		{
			name: "click + getState",
			functions: ["keyboard_press", "keyboard_release", "keyboard_getKeyState"],
			test: async function () {
				var k = new Keyboard();
				await k.click(KEYS.KEY_SHIFT);
				assert(await waitForAsync(async function () {
					return (await Keyboard.getState(KEYS.KEY_SHIFT)) === false;
				}, 200), "shift released after click");
			},
		},

		// ── press/release pair ──────────────────────────────────────────

		{
			name: "press then release pair",
			functions: ["keyboard_press", "keyboard_release", "keyboard_getKeyState"],
			test: async function () {
				var k = new Keyboard();
				try {
					await k.press(KEYS.KEY_SHIFT);
					assert(await waitForAsync(async function () {
						return (await Keyboard.getState(KEYS.KEY_SHIFT)) === true;
					}, 200), "shift pressed");
				} finally {
					await k.release(KEYS.KEY_SHIFT);
					await waitForAsync(async function () {
						return (await Keyboard.getState(KEYS.KEY_SHIFT)) === false;
					}, 200);
				}
				assert(await waitForAsync(async function () {
					return (await Keyboard.getState(KEYS.KEY_SHIFT)) === false;
				}, 200), "shift released");
			},
		},

		// ── click with string key ───────────────────────────────────────

		{
			name: "click string SPACE",
			functions: ["keyboard_press", "keyboard_release", "keyboard_getKeyState"],
			test: async function () {
				var k = new Keyboard();
				await k.click("{SPACE}");
				assert(await waitForAsync(async function () {
					return (await Keyboard.getState(KEYS.KEY_SPACE)) === false;
				}, 200), "click string SPACE released");
			},
		},

		{
			name: "click string 'a'",
			functions: ["keyboard_press", "keyboard_release", "keyboard_getKeyState"],
			test: async function () {
				var k = new Keyboard();
				await k.click("a");
				assert(await waitForAsync(async function () {
					return (await Keyboard.getState(KEYS.KEY_A)) === false;
				}, 200), "click string 'a' released");
			},
		},
	];
};
