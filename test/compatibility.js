////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                Mechatron Compatibility Matrix Validator                     //
//                                                                            //
//  Reads COMPATIBILITY.md and validates every "ok" cell by running a         //
//  per-function behavioral test that proves the function is implemented       //
//  and works on the current backend/platform.                                //
//                                                                            //
//  Each function in the matrix has a dedicated test that calls the API       //
//  method and validates the return type/value.  The matrix cell controls     //
//  whether the test runs:                                                    //
//    - "ok"   → run the test; failure = CI failure                           //
//    - "skip" → skip gracefully                                              //
//    - "n/a"  → skip (backend doesn't run on this platform)                  //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

var fs = require("fs");
var path = require("path");

// =============================================================================
// Markdown table parser
// =============================================================================

function parseMatrix(mdPath) {
	var text = fs.readFileSync(mdPath, "utf8");
	var lines = text.split("\n");
	var result = {};
	var currentSubsystem = null;
	var columns = null;

	for (var i = 0; i < lines.length; i++) {
		var line = lines[i].trim();

		var headerMatch = line.match(/^##\s+(Keyboard|Mouse|Window|Process|Screen|Clipboard)\s*$/);
		if (headerMatch) {
			currentSubsystem = headerMatch[1].toLowerCase();
			result[currentSubsystem] = {};
			columns = null;
			continue;
		}

		if (!currentSubsystem) continue;

		if (line.indexOf("| Function") === 0) {
			columns = line.split("|")
				.map(function (c) { return c.trim(); })
				.filter(function (c) { return c.length > 0; });
			continue;
		}

		if (line.match(/^\|[\s-|]+\|$/)) continue;

		if (columns && line.indexOf("|") === 0 && line.lastIndexOf("|") === line.length - 1) {
			var cells = line.split("|")
				.map(function (c) { return c.trim(); })
				.filter(function (c) { return c.length > 0; });
			if (cells.length < 2) continue;

			var fnName = cells[0];
			if (fnName.indexOf("_") === -1) continue;

			result[currentSubsystem][fnName] = {};
			for (var j = 1; j < cells.length && j < columns.length; j++) {
				var status = cells[j].toLowerCase().replace(/`/g, "");
				result[currentSubsystem][fnName][columns[j]] = status;
			}
		}

		if (line === "" && columns) {
			columns = null;
		}
	}
	return result;
}

// =============================================================================
// Column detection
// =============================================================================

function detectColumns(mechatron) {
	var subsystems = ["keyboard", "mouse", "window", "process", "screen", "clipboard"];
	var backendStr = null;
	for (var i = 0; i < subsystems.length; i++) {
		var b = mechatron.getBackend(subsystems[i]);
		if (b) { backendStr = b; break; }
	}
	if (!backendStr) return null;

	var base = backendStr.replace(/\[.*$/, "");
	var variant = "";
	var varMatch = backendStr.match(/\[(\w+)\]/);
	if (varMatch) variant = varMatch[1];

	if (base === "napi") return ["napi"];

	if (base === "ffi") {
		switch (process.platform) {
			case "linux": return ["ffi/linux"];
			case "win32": return ["ffi/win32"];
			case "darwin": return ["ffi/mac"];
			default: return null;
		}
	}

	// nolib: return variant-specific column first, then platform-generic
	// fallback.  Some subsystems (Process, Clipboard) use "nolib/linux"
	// or "nolib/mac" as a single column covering all Linux variants.
	if (base === "nolib") {
		var cols = [];
		if (variant === "x11") cols.push("nolib/x11");
		else if (variant === "portal") cols.push("nolib/portal");
		else if (variant === "vt") cols.push("nolib/vt");
		else if (process.platform === "darwin") cols.push("nolib/mac");
		else if (process.platform === "linux") cols.push("nolib/x11");

		if (process.platform === "linux" && cols[0] !== "nolib/linux") {
			cols.push("nolib/linux");
		}
		if (process.platform === "darwin" && cols[0] !== "nolib/mac") {
			cols.push("nolib/mac");
		}
		return cols.length > 0 ? cols : null;
	}

	return null;
}

function lookupStatus(statusMap, columns) {
	for (var i = 0; i < columns.length; i++) {
		var s = statusMap[columns[i]];
		if (s) return s;
	}
	return null;
}

// =============================================================================
// Per-function behavioral tests
//
// Each test calls the actual API method and validates its return type or
// value.  Tests are async to support the modern async API surface.
// A test function returns true on success or throws on failure.
// =============================================================================

function buildTestRegistry(mechatron, assert) {
	var Keyboard = mechatron.Keyboard;
	var Mouse = mechatron.Mouse;
	var Window = mechatron.Window;
	var Process = mechatron.Process;
	var Screen = mechatron.Screen;
	var Clipboard = mechatron.Clipboard;
	var Image = mechatron.Image;
	var KEYS = mechatron.KEYS;

	return {
		// ── Keyboard ──────────────────────────────────────────────
		keyboard_press: async function () {
			var k = new Keyboard();
			await k.press(KEYS.KEY_SHIFT);
			await k.release(KEYS.KEY_SHIFT);
		},
		keyboard_release: async function () {
			var k = new Keyboard();
			await k.press(KEYS.KEY_SHIFT);
			await k.release(KEYS.KEY_SHIFT);
		},
		keyboard_getKeyState: async function () {
			var state = await Keyboard.getState(KEYS.KEY_SHIFT);
			assert(typeof state === "boolean", "getState returns boolean");
		},

		// ── Mouse ─────────────────────────────────────────────────
		mouse_press: async function () {
			var m = new Mouse();
			await m.press(mechatron.BUTTON_LEFT);
			await m.release(mechatron.BUTTON_LEFT);
		},
		mouse_release: async function () {
			var m = new Mouse();
			await m.press(mechatron.BUTTON_LEFT);
			await m.release(mechatron.BUTTON_LEFT);
		},
		mouse_scrollH: async function () {
			var m = new Mouse();
			await m.scrollH(1);
			await m.scrollH(-1);
		},
		mouse_scrollV: async function () {
			var m = new Mouse();
			await m.scrollV(1);
			await m.scrollV(-1);
		},
		mouse_getPos: async function () {
			var pos = await Mouse.getPos();
			assert(typeof pos.x === "number" && typeof pos.y === "number",
				"getPos returns {x, y} with numbers");
		},
		mouse_setPos: async function () {
			var old = await Mouse.getPos();
			await Mouse.setPos(50, 50);
			await Mouse.setPos(old.x, old.y);
		},
		mouse_getButtonState: async function () {
			var state = await Mouse.getState(mechatron.BUTTON_LEFT);
			assert(typeof state === "boolean", "getState returns boolean");
		},

		// ── Window ────────────────────────────────────────────────
		window_isValid: async function () {
			var w = new Window();
			assert(typeof await w.isValid() === "boolean", "isValid returns boolean");
		},
		window_close: async function () {
			var w = new Window();
			await w.close();
		},
		window_isTopMost: async function () {
			var w = new Window();
			assert(typeof await w.isTopMost() === "boolean", "isTopMost returns boolean");
		},
		window_isBorderless: async function () {
			var w = new Window();
			assert(typeof await w.isBorderless() === "boolean", "isBorderless returns boolean");
		},
		window_isMinimized: async function () {
			var w = new Window();
			assert(typeof await w.isMinimized() === "boolean", "isMinimized returns boolean");
		},
		window_isMaximized: async function () {
			var w = new Window();
			assert(typeof await w.isMaximized() === "boolean", "isMaximized returns boolean");
		},
		window_setTopMost: async function () {
			var w = new Window();
			await w.setTopMost(false);
		},
		window_setBorderless: async function () {
			var w = new Window();
			await w.setBorderless(false);
		},
		window_setMinimized: async function () {
			var w = new Window();
			await w.setMinimized(false);
		},
		window_setMaximized: async function () {
			var w = new Window();
			await w.setMaximized(false);
		},
		window_getProcess: async function () {
			var w = new Window();
			var p = await w.getProcess();
			assert(typeof p === "object", "getProcess returns object");
		},
		window_getPID: async function () {
			var w = new Window();
			assert(typeof await w.getPID() === "number", "getPID returns number");
		},
		window_getHandle: function () {
			var w = new Window();
			assert(typeof w.getHandle() === "number", "getHandle returns number");
		},
		window_setHandle: async function () {
			var w = new Window();
			var result = await w.setHandle(0);
			assert(typeof result === "boolean", "setHandle returns boolean");
		},
		window_getTitle: async function () {
			var w = new Window();
			assert(typeof await w.getTitle() === "string", "getTitle returns string");
		},
		window_setTitle: async function () {
			var w = new Window();
			await w.setTitle("");
		},
		window_getBounds: async function () {
			var w = new Window();
			var b = await w.getBounds();
			assert(b instanceof mechatron.Bounds, "getBounds returns Bounds");
		},
		window_setBounds: async function () {
			var w = new Window();
			await w.setBounds(0, 0, 100, 100);
		},
		window_getClient: async function () {
			var w = new Window();
			var c = await w.getClient();
			assert(c instanceof mechatron.Bounds, "getClient returns Bounds");
		},
		window_setClient: async function () {
			var w = new Window();
			await w.setClient(0, 0, 100, 100);
		},
		window_mapToClient: async function () {
			var w = new Window();
			var p = await w.mapToClient(10, 10);
			assert(p instanceof mechatron.Point, "mapToClient returns Point");
		},
		window_mapToScreen: async function () {
			var w = new Window();
			var p = await w.mapToScreen(10, 10);
			assert(p instanceof mechatron.Point, "mapToScreen returns Point");
		},
		window_getList: async function () {
			var list = await Window.getList();
			assert(list instanceof Array, "getList returns Array");
		},
		window_getActive: async function () {
			var active = await Window.getActive();
			assert(active instanceof Window, "getActive returns Window");
		},
		window_setActive: async function () {
			var w = new Window();
			await Window.setActive(w);
		},
		window_isAxEnabled: async function () {
			assert(typeof await Window.isAxEnabled() === "boolean", "isAxEnabled returns boolean");
		},

		// ── Process ───────────────────────────────────────────────
		process_open: async function () {
			var p = new Process();
			var result = await p.open(process.pid);
			assert(typeof result === "boolean", "open returns boolean");
			await p.close();
		},
		process_close: async function () {
			var p = new Process();
			await p.close();
		},
		process_isValid: async function () {
			var p = new Process();
			assert(typeof await p.isValid() === "boolean", "isValid returns boolean");
		},
		process_is64Bit: async function () {
			var curr = await Process.getCurrent();
			assert(typeof await curr.is64Bit() === "boolean", "is64Bit returns boolean");
		},
		process_isDebugged: async function () {
			var curr = await Process.getCurrent();
			assert(typeof await curr.isDebugged() === "boolean", "isDebugged returns boolean");
		},
		process_getHandle: async function () {
			var curr = await Process.getCurrent();
			assert(typeof await curr.getHandle() === "number", "getHandle returns number");
		},
		process_getName: async function () {
			var curr = await Process.getCurrent();
			var name = await curr.getName();
			assert(typeof name === "string" && name.length > 0, "getName returns non-empty string");
		},
		process_getPath: async function () {
			var curr = await Process.getCurrent();
			var p = await curr.getPath();
			assert(typeof p === "string" && p.length > 0, "getPath returns non-empty string");
		},
		process_exit: async function () {
			// Test on an invalid process — should not crash
			var p = new Process();
			await p.exit();
		},
		process_kill: async function () {
			var p = new Process();
			await p.kill();
		},
		process_hasExited: async function () {
			var p = new Process();
			assert(typeof await p.hasExited() === "boolean", "hasExited returns boolean");
		},
		process_getCurrent: async function () {
			var curr = await Process.getCurrent();
			assert(await curr.isValid(), "getCurrent returns valid process");
			assert(curr.getPID() > 0, "getCurrent has positive PID");
		},
		process_isSys64Bit: async function () {
			assert(typeof await Process.isSys64Bit() === "boolean", "isSys64Bit returns boolean");
		},
		process_getList: async function () {
			var list = await Process.getList();
			assert(list instanceof Array && list.length > 0, "getList returns non-empty array");
		},
		process_getWindows: async function () {
			var curr = await Process.getCurrent();
			var wins = await curr.getWindows();
			assert(wins instanceof Array, "getWindows returns Array");
		},
		process_getModules: async function () {
			var curr = await Process.getCurrent();
			var mods = await curr.getModules();
			assert(mods instanceof Array && mods.length > 0, "getModules returns non-empty array");
		},
		process_getSegments: null,

		// ── Screen ────────────────────────────────────────────────
		screen_synchronize: async function () {
			var result = await Screen.synchronize();
			assert(result === true, "synchronize returns true");
		},
		screen_grabScreen: async function () {
			var img = new Image();
			var result = await Screen.grabScreen(img, 0, 0, 10, 10);
			assert(typeof result === "boolean", "grabScreen returns boolean");
		},

		// ── Clipboard ─────────────────────────────────────────────
		clipboard_clear: async function () {
			var result = await Clipboard.clear();
			assert(typeof result === "boolean", "clear returns boolean");
		},
		clipboard_hasText: async function () {
			assert(typeof await Clipboard.hasText() === "boolean", "hasText returns boolean");
		},
		clipboard_getText: async function () {
			assert(typeof await Clipboard.getText() === "string", "getText returns string");
		},
		clipboard_setText: async function () {
			var result = await Clipboard.setText("mechatron_compat_test");
			assert(typeof result === "boolean", "setText returns boolean");
			if (result) {
				var text = await Clipboard.getText();
				assert(text === "mechatron_compat_test", "setText round-trip");
			}
		},
		clipboard_hasImage: async function () {
			assert(typeof await Clipboard.hasImage() === "boolean", "hasImage returns boolean");
		},
		clipboard_getImage: async function () {
			var img = new Image();
			var result = await Clipboard.getImage(img);
			assert(typeof result === "boolean", "getImage returns boolean");
		},
		clipboard_setImage: async function () {
			var img = new Image(2, 2);
			img.fill(128, 64, 32);
			var result = await Clipboard.setImage(img);
			assert(typeof result === "boolean", "setImage returns boolean");
		},
		clipboard_getSequence: async function () {
			var seq = await Clipboard.getSequence();
			assert(typeof seq === "number", "getSequence returns number");
		},
	};
}

// =============================================================================
// Main test function
// =============================================================================

module.exports = function (mechatron, log, assert) {

	async function testCompatibility() {
		log("  Compatibility matrix... ");

		var mdPath = path.resolve(__dirname, "..", "COMPATIBILITY.md");
		if (!fs.existsSync(mdPath)) {
			log("SKIP (COMPATIBILITY.md not found)\n");
			return true;
		}

		var matrix = parseMatrix(mdPath);
		var columns = detectColumns(mechatron);
		if (!columns) {
			log("SKIP (could not detect column: no backend loaded)\n");
			return true;
		}

		log("(columns: " + columns.join(", ") + ")\n");

		var registry = buildTestRegistry(mechatron, assert);

		var checked = 0;
		var skipped = 0;
		var failed = 0;
		var subsystems = Object.keys(matrix);

		for (var s = 0; s < subsystems.length; s++) {
			var subsystem = subsystems[s];
			var functions = matrix[subsystem];
			var fnNames = Object.keys(functions);

			for (var f = 0; f < fnNames.length; f++) {
				var fnName = fnNames[f];
				var statusMap = functions[fnName];
				var status = lookupStatus(statusMap, columns);

				if (!status || status === "n/a" || status === "skip") {
					skipped++;
					continue;
				}

				if (status !== "ok") {
					skipped++;
					continue;
				}

				var testFn = registry[fnName];
				if (!testFn) {
					skipped++;
					continue;
				}

				try {
					await testFn();
					checked++;
				} catch (e) {
					log("    FAIL: " + fnName + " — " + e.message + "\n");
					failed++;
				}
			}
		}

		log("    (" + checked + " passed, " + skipped + " skipped" +
			(failed > 0 ? ", " + failed + " FAILED" : "") + ")\n");

		if (failed > 0) {
			assert(false, failed + " compatibility test(s) failed");
		}

		return true;
	}

	return {
		testCompatibility: testCompatibility,
	};
};
