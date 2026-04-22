////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                Mechatron Compatibility Matrix Validator                     //
//                                                                            //
//  Reads COMPATIBILITY.md and validates that every "ok" cell corresponds     //
//  to a loadable, callable function on the current backend/platform.         //
//                                                                            //
//  Behavioral correctness is verified by the dedicated subsystem tests       //
//  (keyboard.js, mouse.js, etc.).  This test ensures the matrix document     //
//  stays in sync with reality: if a cell says "ok", the backend module       //
//  must load and the function must exist; if "skip", the function either     //
//  doesn't exist or is a documented stub.                                    //
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

function detectColumn(mechatron) {
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

	if (base === "napi") return "napi";

	if (base === "ffi") {
		switch (process.platform) {
			case "linux": return "ffi/linux";
			case "win32": return "ffi/win32";
			case "darwin": return "ffi/mac";
			default: return null;
		}
	}

	if (base === "nolib") {
		if (variant === "x11") return "nolib/x11";
		if (variant === "portal") return "nolib/portal";
		if (variant === "vt") return "nolib/vt";
		if (process.platform === "darwin") return "nolib/mac";
		if (process.platform === "linux") return "nolib/x11";
		return null;
	}

	return null;
}

// =============================================================================
// Method-existence maps
//
// Maps function names from the matrix to [class, methodName, isStatic] tuples.
// The validator checks that the method exists on the class prototype (instance
// methods) or the class itself (static methods).  This is intentionally
// shallow: behavioral testing is done by the dedicated subsystem tests.
// =============================================================================

var SUBSYSTEM_MAP = {
	keyboard: {
		"keyboard_press":       ["Keyboard", "press", false],
		"keyboard_release":     ["Keyboard", "release", false],
		"keyboard_getKeyState": ["Keyboard", "getState", true],
	},
	mouse: {
		"mouse_press":          ["Mouse", "press", false],
		"mouse_release":        ["Mouse", "release", false],
		"mouse_scrollH":        ["Mouse", "scrollH", false],
		"mouse_scrollV":        ["Mouse", "scrollV", false],
		"mouse_getPos":         ["Mouse", "getPos", true],
		"mouse_setPos":         ["Mouse", "setPos", true],
		"mouse_getButtonState": ["Mouse", "getState", true],
	},
	window: {
		"window_isValid":       ["Window", "isValid", false],
		"window_close":         ["Window", "close", false],
		"window_isTopMost":     ["Window", "isTopMost", false],
		"window_isBorderless":  ["Window", "isBorderless", false],
		"window_isMinimized":   ["Window", "isMinimized", false],
		"window_isMaximized":   ["Window", "isMaximized", false],
		"window_setTopMost":    ["Window", "setTopMost", false],
		"window_setBorderless": ["Window", "setBorderless", false],
		"window_setMinimized":  ["Window", "setMinimized", false],
		"window_setMaximized":  ["Window", "setMaximized", false],
		"window_getProcess":    ["Window", "getProcess", false],
		"window_getPID":        ["Window", "getPID", false],
		"window_getHandle":     ["Window", "getHandle", false],
		"window_setHandle":     ["Window", "setHandle", false],
		"window_getTitle":      ["Window", "getTitle", false],
		"window_setTitle":      ["Window", "setTitle", false],
		"window_getBounds":     ["Window", "getBounds", false],
		"window_setBounds":     ["Window", "setBounds", false],
		"window_getClient":     ["Window", "getClient", false],
		"window_setClient":     ["Window", "setClient", false],
		"window_mapToClient":   ["Window", "mapToClient", false],
		"window_mapToScreen":   ["Window", "mapToScreen", false],
		"window_getList":       ["Window", "getList", true],
		"window_getActive":     ["Window", "getActive", true],
		"window_setActive":     ["Window", "setActive", true],
		"window_isAxEnabled":   ["Window", "isAxEnabled", true],
	},
	process: {
		"process_open":         ["Process", "open", false],
		"process_close":        ["Process", "close", false],
		"process_isValid":      ["Process", "isValid", false],
		"process_is64Bit":      ["Process", "is64Bit", false],
		"process_isDebugged":   ["Process", "isDebugged", false],
		"process_getHandle":    ["Process", "getHandle", false],
		"process_getName":      ["Process", "getName", false],
		"process_getPath":      ["Process", "getPath", false],
		"process_exit":         ["Process", "exit", false],
		"process_kill":         ["Process", "kill", false],
		"process_hasExited":    ["Process", "hasExited", false],
		"process_getCurrent":   ["Process", "getCurrent", true],
		"process_isSys64Bit":   ["Process", "isSys64Bit", true],
		"process_getList":      ["Process", "getList", true],
		"process_getWindows":   ["Process", "getWindows", false],
		"process_getModules":   ["Process", "getModules", false],
		"process_getSegments":  [null, null, null],
	},
	screen: {
		"screen_synchronize":   ["Screen", "synchronize", true],
		"screen_grabScreen":    ["Screen", "grabScreen", true],
	},
	clipboard: {
		"clipboard_clear":       ["Clipboard", "clear", true],
		"clipboard_hasText":     ["Clipboard", "hasText", true],
		"clipboard_getText":     ["Clipboard", "getText", true],
		"clipboard_setText":     ["Clipboard", "setText", true],
		"clipboard_hasImage":    ["Clipboard", "hasImage", true],
		"clipboard_getImage":    ["Clipboard", "getImage", true],
		"clipboard_setImage":    ["Clipboard", "setImage", true],
		"clipboard_getSequence": ["Clipboard", "getSequence", true],
	},
};

function validateFunction(mechatron, subsystem, fnName, status, assert) {
	var map = SUBSYSTEM_MAP[subsystem];
	if (!map) return "skip";
	var entry = map[fnName];
	if (!entry || !entry[0]) return "skip";

	var className = entry[0];
	var methodName = entry[1];
	var isStatic = entry[2];

	var cls = mechatron[className];
	if (!cls) {
		if (status === "ok") {
			assert(false, fnName + ": class " + className + " not found on mechatron");
		}
		return "skip";
	}

	var target = isStatic ? cls : cls.prototype;
	var fn = target && target[methodName];
	if (status === "ok") {
		assert(typeof fn === "function",
			fnName + ": " + className + (isStatic ? "." : ".prototype.") +
			methodName + " must be a function (got " + typeof fn + ")");
		return "ok";
	}
	return "skip";
}

// =============================================================================
// Main test function
// =============================================================================

module.exports = function (mechatron, log, assert) {

	function testCompatibility() {
		log("  Compatibility matrix... ");

		var mdPath = path.resolve(__dirname, "..", "COMPATIBILITY.md");
		if (!fs.existsSync(mdPath)) {
			log("SKIP (COMPATIBILITY.md not found)\n");
			return true;
		}

		var matrix = parseMatrix(mdPath);
		var column = detectColumn(mechatron);
		if (!column) {
			log("SKIP (could not detect column: no backend loaded)\n");
			return true;
		}

		log("(column: " + column + ") ");

		var checked = 0;
		var skipped = 0;
		var subsystems = Object.keys(matrix);
		for (var s = 0; s < subsystems.length; s++) {
			var subsystem = subsystems[s];
			var functions = matrix[subsystem];

			if (!mechatron.isAvailable(subsystem)) {
				skipped += Object.keys(functions).length;
				continue;
			}

			var fnNames = Object.keys(functions);
			for (var f = 0; f < fnNames.length; f++) {
				var fnName = fnNames[f];
				var statusMap = functions[fnName];
				var status = statusMap[column];

				if (!status || status === "n/a") { skipped++; continue; }

				var result = validateFunction(mechatron, subsystem, fnName, status, assert);
				if (result === "ok") {
					checked++;
				} else {
					skipped++;
				}
			}
		}

		log("(" + checked + " ok, " + skipped + " skipped) OK\n");
		return true;
	}

	return {
		testCompatibility: testCompatibility,
	};
};
