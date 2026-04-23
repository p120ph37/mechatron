////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Modern API Test Suite                          //
//                                                                            //
//  Single-backend Node.js runner for the modern mechatron API surface.       //
//  This is the legacy fallback used in CI for the matrix cells where Bun     //
//  isn't usable: Windows ia32 (no 32-bit Bun build) and macOS x64 cross-     //
//  compiled on arm64 (Bun's macOS x64 binary SIGILLs under Rosetta).         //
//  Every other cell runs `bun test test/bun.test.ts`, which exercises both   //
//  the napi and ffi backends and produces JavaScriptCore-based coverage.    //
//                                                                            //
//  For robot-js legacy API tests, see packages/mechatron-robot-js/test/.    //
//                                                                            //
//  Usage:                                                                    //
//    node test/test.js [tests...] --backend napi [--junit <path>]            //
//    node test/test.js all --backend napi                                    //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

// Parse named flags: --backend <val>, --junit <path>
function extractFlag(args, flag) {
	var idx = args.indexOf(flag);
	if (idx < 0) return { value: null, rest: args };
	var val = args[idx + 1] || null;
	var rest = args.filter(function (_, i) { return i !== idx && i !== idx + 1; });
	return { value: val, rest: rest };
}

var _allArgs = process.argv.slice(2);
var _b = extractFlag(_allArgs, "--backend");
var _backendArg = _b.value || "napi";
var _j = extractFlag(_b.rest, "--junit");
var _junitPath = _j.value;
var _testArgs = _j.rest;

if (_backendArg !== "napi" && _backendArg !== "ffi") {
	process.stderr.write("Unknown backend: " + _backendArg + "\n");
	process.exit(2);
}
process.env.MECHATRON_BACKEND = _backendArg;
var mechatron = require("..");

////////////////////////////////////////////////////////////////////////////////

function log(msg) {
	process.stdout.write(msg);
}

function assert(cond, msg) {
	if (!cond) {
		throw new Error("Assertion Failed" + (msg ? ": " + msg : "") + "\x07\n");
	}
}

function waitFor(condFn, timeoutMs) {
	if (condFn()) return true;
	var step = 5;
	for (var elapsed = 0; elapsed < timeoutMs; elapsed += step) {
		mechatron.Timer.sleep(step);
		if (condFn()) return true;
	}
	return false;
}

////////////////////////////////////////////////////////////////////////////////

// Load compatibility matrix
var compatMatrix = require("./matrix").create(mechatron);

// Load test modules — each returns an array of { name, functions, test }.
// The `subsystem` field gates the entire module on backend availability:
// when the backend for a subsystem didn't load (e.g. dlopen blocked),
// every entry in that module is skipped regardless of the matrix cell.
var allModules = [
	{ prefix: "types",     subsystem: null,        entries: require("./types")(mechatron, log, assert, waitFor) },
	{ prefix: "keyboard",  subsystem: "keyboard",  entries: require("./keyboard")(mechatron, log, assert, waitFor) },
	{ prefix: "mouse",     subsystem: "mouse",     entries: require("./mouse")(mechatron, log, assert, waitFor) },
	{ prefix: "clipboard", subsystem: "clipboard", entries: require("./clipboard")(mechatron, log, assert, waitFor) },
	{ prefix: "process",   subsystem: "process",   entries: require("./process")(mechatron, log, assert, waitFor) },
	{ prefix: "window",    subsystem: "window",    entries: require("./window")(mechatron, log, assert, waitFor) },
	{ prefix: "screen",    subsystem: "screen",    entries: require("./screen")(mechatron, log, assert, waitFor) },
	{ prefix: "memory",    subsystem: "memory",    entries: require("./memory")(mechatron, log, assert, waitFor) },
	{ prefix: "uinput",    subsystem: null,        entries: require("./uinput")(mechatron, log, assert, waitFor) },
	{ prefix: "xproto",    subsystem: null,        entries: require("./xproto")(mechatron, log, assert, waitFor) },
];

// Flatten into a single list of [displayName, testFn] pairs.
// Two gates per entry: (1) subsystem backend must be loaded, (2) matrix
// must approve the declared functions for the current platform/column.
var tests = [];
for (var m = 0; m < allModules.length; m++) {
	var mod = allModules[m];
	var entries = mod.entries;
	var subsystemAvailable = !mod.subsystem || mechatron.isAvailable(mod.subsystem);
	for (var e = 0; e < entries.length; e++) {
		var entry = entries[e];
		var displayName = mod.prefix + ": " + entry.name;
		tests.push([displayName, (function (ent, dname, subAvail) {
			return function () {
				if (!subAvail) {
					log("  " + dname + " (skipped: backend unavailable)\n");
					return true;
				}
				if (!compatMatrix.shouldRun(ent.functions)) {
					var reason = compatMatrix.getDemotionReason(ent.functions) || "matrix skip";
					log("  " + dname + " (skipped: " + reason + ")\n");
					return true;
				}
				return ent.test();
			};
		})(entry, displayName, subsystemAvailable)]);
	}
}

////////////////////////////////////////////////////////////////////////////////

async function main() {
	log("\nMECHATRON TEST SUITE [" + _backendArg.toUpperCase() + " backend]\n");
	log("------------------------------\n");
	log("Platform: " + process.platform + " " + process.arch + "\n");
	log("Node: " + process.version + "\n");
	log("UID: " + (process.getuid ? process.getuid() : "N/A") + "\n");
	log("Backend: " + _backendArg + "\n");
	if (compatMatrix.available) {
		log("Matrix columns: " + compatMatrix.columns.join(", ") + "\n");
	} else {
		log("Matrix: unavailable (all tests run)\n");
	}
	log("------------------------------\n\n");

	// Verify isAvailable() for all subsystems before running tests
	log("  Availability... ");
	var subs = ["keyboard", "mouse", "clipboard", "screen", "window", "process", "memory"];
	for (var i = 0; i < subs.length; ++i) {
		assert(typeof mechatron.isAvailable(subs[i]) === "boolean",
			"isAvailable(" + subs[i] + ") is boolean");
	}
	assert(mechatron.isAvailable("keyboard"), "keyboard available");
	log("OK\n\n");

	// Parse command line for specific tests
	var requested = _testArgs;
	var filteredTests = tests;
	if (requested.length > 0 && requested[0] !== "all") {
		filteredTests = tests.filter(function (t) {
			for (var r = 0; r < requested.length; r++) {
				if (t[0] === requested[r]) return true;
				if (t[0].indexOf(requested[r] + ":") === 0) return true;
			}
			return false;
		});
	}

	var failed = false;
	var results = [];
	for (var i = 0; i < filteredTests.length; ++i) {
		var t0 = performance.now();
		var err = null;
		try {
			await filteredTests[i][1]();
		} catch (e) {
			log("  FAILED: " + filteredTests[i][0] + " - " + e.message + "\n");
			if (e.stack) log("  " + e.stack.split("\n").slice(0, 3).join("\n  ") + "\n");
			failed = true;
			err = e;
		}
		results.push({
			name: filteredTests[i][0],
			time: ((performance.now() - t0) / 1000).toFixed(3),
			error: err,
		});
	}

	log("\n------------------------------\n");
	if (failed) {
		log("SOME TESTS FAILED\n");
	} else {
		log("ALL TESTS PASSED\n\n");
	}

	// Write JUnit XML if requested
	if (_junitPath) {
		writeJUnit(_junitPath, results);
	}

	return failed ? 2 : 0;
}

function writeJUnit(filePath, results) {
	var fs = require("fs");
	var path = require("path");
	var passed = results.filter(function (r) { return !r.error; }).length;
	var failures = results.length - passed;
	var totalTime = results.reduce(function (s, r) { return s + parseFloat(r.time); }, 0).toFixed(3);

	var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
	xml += '<testsuites tests="' + results.length + '" failures="' + failures + '" time="' + totalTime + '">\n';
	xml += '  <testsuite name="mechatron" tests="' + results.length + '" failures="' + failures + '" time="' + totalTime + '">\n';
	for (var i = 0; i < results.length; ++i) {
		var r = results[i];
		xml += '    <testcase name="' + escapeXml(r.name) + '" classname="mechatron" time="' + r.time + '"';
		if (r.error) {
			xml += '>\n';
			xml += '      <failure message="' + escapeXml(r.error.message) + '">';
			xml += escapeXml(r.error.stack || r.error.message);
			xml += '</failure>\n';
			xml += '    </testcase>\n';
		} else {
			xml += '/>\n';
		}
	}
	xml += '  </testsuite>\n';
	xml += '</testsuites>\n';

	try {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
	} catch (_) {}
	fs.writeFileSync(filePath, xml);
	log("JUnit XML written to " + filePath + "\n");
}

function escapeXml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

main().then(function (rc) { process.exitCode = rc; }, function (e) {
	log("  FATAL: " + (e && e.stack || e) + "\n");
	process.exitCode = 2;
});
