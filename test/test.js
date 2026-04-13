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

////////////////////////////////////////////////////////////////////////////////

// Platform capability expectations
var gExpected = {
	"linux-x64":     { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
	"linux-arm64":   { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
	"darwin-arm64":  { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
	"darwin-x64":    { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
	"win32-x64":     { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
	"win32-ia32":    { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true },
};

var gPlatformKey = process.platform + "-" + process.arch;
var gExpect = gExpected[gPlatformKey] || {};

////////////////////////////////////////////////////////////////////////////////

function log(msg) {
	process.stdout.write(msg);
}

function assert(cond, msg) {
	if (!cond) {
		throw new Error("Assertion Failed" + (msg ? ": " + msg : "") + "\x07\n");
	}
}

function assertThrows(fn, thisArg, args) {
	try {
		fn.apply(thisArg, args);
		assert(false, "Expected " + fn.name + " to throw");
	} catch (e) { }
}

function expectOrSkip(capability, label) {
	if (gExpect[capability]) {
		assert(false, label + " — expected to work on " + gPlatformKey + " but probe failed (regression!)");
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

// Load test modules
var typesModule     = require("./types")(mechatron, log, assert);
var keyboardModule  = require("./keyboard")(mechatron, log, assert, waitFor, expectOrSkip);
var mouseModule     = require("./mouse")(mechatron, log, assert, waitFor, expectOrSkip);
var clipboardModule = require("./clipboard")(mechatron, log, assert, waitFor, expectOrSkip);
var processModule   = require("./process")(mechatron, log, assert, waitFor, expectOrSkip);
var windowModule    = require("./window")(mechatron, log, assert, waitFor, expectOrSkip);
var screenModule    = require("./screen")(mechatron, log, assert, waitFor, expectOrSkip);
var memoryModule    = require("./memory")(mechatron, log, assert, waitFor, expectOrSkip);

////////////////////////////////////////////////////////////////////////////////

async function main() {
	log("\nMECHATRON TEST SUITE [" + _backendArg.toUpperCase() + " backend]\n");
	log("------------------------------\n");
	log("Platform: " + process.platform + " " + process.arch + "\n");
	log("Node: " + process.version + "\n");
	log("UID: " + (process.getuid ? process.getuid() : "N/A") + "\n");
	log("Backend: " + _backendArg + "\n");
	var expectKeys = Object.keys(gExpect);
	if (expectKeys.length > 0) {
		var required = expectKeys.filter(function (k) { return gExpect[k]; });
		log("Expected: " + (required.length > 0 ? required.join(", ") : "(none)") + "\n");
	} else {
		log("Expected: (no expectations defined for " + gPlatformKey + ")\n");
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

	var tests = [
		["types",     typesModule.testTypes],
		["timer",     typesModule.testTimer],
		["keyboard",  keyboardModule.testKeyboard],
		["mouse",     mouseModule.testMouse],
		["clipboard", clipboardModule.testClipboard],
		["process",   processModule.testProcess],
		["window",    windowModule.testWindow],
		["screen",    screenModule.testScreen],
		["memory",    memoryModule.testMemory],
	];

	// Parse command line for specific tests
	var requested = _testArgs;
	if (requested.length > 0 && requested[0] !== "all") {
		tests = tests.filter(function (t) {
			return requested.indexOf(t[0]) >= 0;
		});
	}

	var failed = false;
	var results = [];
	for (var i = 0; i < tests.length; ++i) {
		var t0 = performance.now();
		var err = null;
		try {
			await tests[i][1]();
		} catch (e) {
			log("  FAILED: " + tests[i][0] + " - " + e.message + "\n");
			if (e.stack) log("  " + e.stack.split("\n").slice(0, 3).join("\n  ") + "\n");
			failed = true;
			err = e;
		}
		results.push({
			name: tests[i][0],
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
