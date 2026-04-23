////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                Mechatron Compatibility Matrix Module                        //
//                                                                            //
//  Parses COMPATIBILITY.md and provides shouldRun(functions) to decide       //
//  whether a test should execute on the current backend/platform.            //
//                                                                            //
//  Every test entry is annotated with the matrix function(s) it exercises.   //
//  The runner calls shouldRun(entry.functions) before each test:             //
//    - functions: []           → always run                                  //
//    - functions: ["mouse_getPos"] → run only if mouse_getPos is "ok"       //
//    - functions: ["keyboard_press", "keyboard_getKeyState"]                 //
//      → run only if ALL listed functions are "ok"                           //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

var fs = require("fs");
var path = require("path");

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

function lookupStatus(fnStatusMap, columns) {
	for (var i = 0; i < columns.length; i++) {
		var s = fnStatusMap[columns[i]];
		if (s) return s;
	}
	return null;
}

// Dynamic demotions: CI cells that deliberately cripple functionality
// (blocked dlopen, forced input mechanism) demote specific functions
// from "ok" to "skip" so tests that depend on observing those functions
// are correctly skipped.
function computeDemotions() {
	var demoted = {};
	var blocked = (process.env.MECHATRON_BLOCK_DLOPEN || "").toLowerCase();
	var mechanism = (process.env.MECHATRON_INPUT_MECHANISM || "").toLowerCase();
	var backend = (process.env.MECHATRON_BACKEND || "").toLowerCase();

	// libXtst blocked: XTest-dependent observation fails
	if (blocked.includes("libxtst")) {
		demoted["keyboard_getKeyState"] = "libXtst blocked";
		demoted["mouse_getButtonState"] = "libXtst blocked";
		demoted["mouse_getPos"] = "libXtst blocked";
	}

	// uinput mechanism: input goes through evdev, but Xvfb reads its own
	// IPC — getState/getPos can't observe the synthetic events
	if (mechanism === "uinput") {
		demoted["keyboard_getKeyState"] = "uinput mechanism";
		demoted["mouse_getButtonState"] = "uinput mechanism";
		demoted["mouse_getPos"] = "uinput mechanism";
	}

	// xproto mechanism: async bridge means getState reads arrive before
	// FakeInput flushes
	if (mechanism === "xproto") {
		demoted["keyboard_getKeyState"] = "xproto mechanism";
		demoted["mouse_getButtonState"] = "xproto mechanism";
		demoted["mouse_getPos"] = "xproto mechanism";
	}

	// Portal backend: no state query API
	if (backend.includes("portal")) {
		demoted["keyboard_getKeyState"] = "portal backend";
		demoted["mouse_getButtonState"] = "portal backend";
		demoted["mouse_getPos"] = "portal backend";
	}

	return demoted;
}

module.exports = {
	create: function (mechatron) {
		var mdPath = path.resolve(__dirname, "..", "COMPATIBILITY.md");
		var matrix = null;
		var columns = null;
		var demoted = computeDemotions();

		var ctorSubs = ["keyboard", "mouse", "clipboard", "screen", "window", "process", "memory"];
		for (var c = 0; c < ctorSubs.length; c++) {
			if (!mechatron.isAvailable(ctorSubs[c])) {
				demoted[ctorSubs[c] + "_ctor"] = "backend unavailable";
			}
		}

		if (fs.existsSync(mdPath)) {
			matrix = parseMatrix(mdPath);
			columns = detectColumns(mechatron);
		}

		return {
			available: !!(matrix && columns),
			columns: columns,

			getStatus: function (fnName) {
				if (!matrix || !columns) return null;
				if (demoted[fnName]) return "skip";
				var subsystems = Object.keys(matrix);
				for (var s = 0; s < subsystems.length; s++) {
					var fns = matrix[subsystems[s]];
					if (fns[fnName]) {
						return lookupStatus(fns[fnName], columns) || null;
					}
				}
				return null;
			},

			shouldRun: function (functions) {
				if (!functions || functions.length === 0) return true;
				if (!matrix || !columns) return true;
				for (var i = 0; i < functions.length; i++) {
					var fn = functions[i];
					if (demoted[fn]) return false;
					if (fn.indexOf("_ctor") === fn.length - 5) continue;
					var found = false;
					var subsystems = Object.keys(matrix);
					for (var s = 0; s < subsystems.length; s++) {
						var fns = matrix[subsystems[s]];
						if (fns[fn]) {
							var status = lookupStatus(fns[fn], columns);
							if (status !== "ok") return false;
							found = true;
							break;
						}
					}
					if (!found) return false;
				}
				return true;
			},

			getDemotionReason: function (functions) {
				if (!functions || functions.length === 0) return null;
				for (var i = 0; i < functions.length; i++) {
					if (demoted[functions[i]]) return demoted[functions[i]];
				}
				return null;
			},
		};
	},
};
