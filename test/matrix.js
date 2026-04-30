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
//    - functions: ["keyboard_ctor"] → always run (ctor is always "ok")       //
//    - functions: ["mouse_getPos"] → run only if mouse_getPos is "ok"       //
//    - functions: ["keyboard_press", "keyboard_getKeyState"]                 //
//      → run only if ALL listed functions are "ok"                           //
//                                                                            //
//  Column selection is per-function: the subsystem is extracted from the     //
//  function name (e.g. "keyboard" from "keyboard_press"), then the column    //
//  is derived as process.platform + "-" + getBackend(subsystem).            //
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

		var headerMatch = line.match(/^##\s+(\w+)\s*$/);
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

function columnForSubsystem(mechatron, subsystem) {
	var backend = mechatron.getBackend(subsystem);
	if (!backend) return null;
	return process.platform + "-" + backend;
}

function subsystemFromFn(fnName) {
	var idx = fnName.indexOf("_");
	return idx > 0 ? fnName.substring(0, idx) : null;
}

module.exports = {
	create: function (mechatron) {
		var mdPath = path.resolve(__dirname, "..", "COMPATIBILITY.md");
		var matrix = null;

		try {
			matrix = parseMatrix(mdPath);
		} catch (e) {
			if (e.code !== "ENOENT") throw e;
		}

		return {
			available: !!matrix,

			getStatus: function (fnName) {
				if (!matrix) return null;
				var subsystem = subsystemFromFn(fnName);
				if (!subsystem) return null;
				var column = columnForSubsystem(mechatron, subsystem);
				if (!column) return null;
				var fns = matrix[subsystem];
				if (!fns || !fns[fnName]) return null;
				return fns[fnName][column] || null;
			},

			shouldRun: function (functions) {
				if (!functions || functions.length === 0) return true;
				if (!matrix) return true;
				var columnCache = {};
				for (var i = 0; i < functions.length; i++) {
					var fn = functions[i];
					var subsystem = subsystemFromFn(fn);
					if (!subsystem) return false;
					if (!(subsystem in columnCache)) {
						columnCache[subsystem] = columnForSubsystem(mechatron, subsystem);
					}
					var column = columnCache[subsystem];
					if (!column) return false;
					var fns = matrix[subsystem];
					if (!fns || !fns[fn]) return false;
					if (fns[fn][column] !== "ok") return false;
				}
				return true;
			},

			getOkCells: function () {
				if (!matrix) return [];
				var cells = [];
				var subsystems = Object.keys(matrix);
				for (var s = 0; s < subsystems.length; s++) {
					var sub = subsystems[s];
					var column = columnForSubsystem(mechatron, sub);
					if (!column) continue;
					var fns = Object.keys(matrix[sub]);
					for (var f = 0; f < fns.length; f++) {
						var fn = fns[f];
						if (matrix[sub][fn][column] === "ok") {
							cells.push(fn);
						}
					}
				}
				return cells;
			},
		};
	},
};
