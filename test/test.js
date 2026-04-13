////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Modern API Test Suite                          //
//                                                                            //
//  Exercises all subsystems using the modern mechatron API surface.           //
//  For robot-js legacy API tests, see packages/mechatron-robot-js/test/.     //
//                                                                            //
//  Usage:                                                                    //
//    node test/test.js [tests...] [--backend rust]                           //
//    node test/test.js all                                                   //
//    node test/test.js types timer          (headless subset)                //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

//----------------------------------------------------------------------------//
// Backend selection & dual-backend runner                                     //
//----------------------------------------------------------------------------//

var _allArgs = process.argv.slice(2);

// Parse named flags: --backend <val>, --junit <path>
function extractFlag(args, flag) {
	var idx = args.indexOf(flag);
	if (idx < 0) return { value: null, rest: args };
	var val = args[idx + 1] || null;
	var rest = args.filter(function (_, i) { return i !== idx && i !== idx + 1; });
	return { value: val, rest: rest };
}

var _b = extractFlag(_allArgs, "--backend");
var _backendArg = _b.value;
var _j = extractFlag(_b.rest, "--junit");
var _junitPath = _j.value;
var _testArgs = _j.rest;

// When no --backend specified, run as dual-engine coordinator
//
// Each "engine" is a (runtime, backend) pair:
//   - node-napi: Node.js + napi-rs prebuilt .node modules
//   - bun-napi:  Bun     + napi-rs prebuilt .node modules (Bun supports n-api)
//   - bun-ffi:   Bun     + bun:ffi loaded shared libraries
//
// Test files load mechatron via require("..") and exercise the same TS API
// regardless of backend; the loader in lib/napi.ts picks the native impl.
if (!_backendArg) {
	var _child_process = require("child_process");
	var _path = require("path");
	var _fs = require("fs");

	function _which(bin) {
		var paths = (process.env.PATH || "").split(_path.delimiter);
		for (var i = 0; i < paths.length; ++i) {
			var p = _path.join(paths[i], bin);
			try { _fs.accessSync(p, _fs.constants.X_OK); return p; } catch (_) {}
		}
		return null;
	}

	var _bunPath = _which("bun");

	var _engines = [];

	// Probe Node + napi
	try {
		var _probe = require(_path.resolve(__dirname, ".."));
		new _probe.Keyboard();
		_engines.push({ name: "node-napi", cmd: process.execPath, env: { MECHATRON_BACKEND: "napi" }, backend: "napi" });
	} catch (_e) {
		process.stdout.write("  [skip] node-napi not available (" + _e.message + ")\n");
	}

	// Probe Bun + ffi (only if bun is installed; FFI not yet implemented on macOS)
	if (_bunPath) {
		if (process.platform !== "darwin") {
			_engines.push({ name: "bun-ffi", cmd: _bunPath, env: { MECHATRON_BACKEND: "ffi" }, backend: "ffi" });
		} else {
			process.stdout.write("  [skip] bun-ffi not available (FFI backend not implemented on macOS)\n");
		}
		_engines.push({ name: "bun-napi", cmd: _bunPath, env: { MECHATRON_BACKEND: "napi" }, backend: "napi" });
	} else {
		process.stdout.write("  [skip] bun engines not available (bun not in PATH)\n");
	}

	if (_engines.length === 0) {
		process.stdout.write("\nERROR: No backends available to test!\n");
		process.exitCode = 2;
	} else {
		var _overallFailed = false;
		process.stdout.write("\n==============================\n");
		process.stdout.write("MECHATRON TEST RUNNER\n");
		process.stdout.write("Engines: " + _engines.map(function (e) { return e.name; }).join(", ") + "\n");
		process.stdout.write("==============================\n");

		for (var _bi = 0; _bi < _engines.length; ++_bi) {
			var _eng = _engines[_bi];
			process.stdout.write("\n>>> Running tests with " + _eng.name.toUpperCase() + " engine...\n");

			var _childArgs = [__filename].concat(_testArgs).concat(["--backend", _eng.backend]);
			if (_junitPath) _childArgs.push("--junit", _junitPath.replace(/\.xml$/, "-" + _eng.name + ".xml"));
			var _childEnv = Object.assign({}, process.env, _eng.env);
			var _result = _child_process.spawnSync(_eng.cmd, _childArgs, {
				stdio: "inherit",
				env: _childEnv,
				cwd: _path.resolve(__dirname, ".."),
				timeout: 120000,
			});

			if (_result.status !== 0) {
				_overallFailed = true;
				process.stdout.write(">>> " + _eng.name.toUpperCase() + " engine: FAILED (exit " + _result.status + ")\n");
			} else {
				process.stdout.write(">>> " + _eng.name.toUpperCase() + " engine: PASSED\n");
			}
		}

		process.stdout.write("\n==============================\n");
		if (_overallFailed) {
			process.stdout.write("RESULT: SOME ENGINES FAILED\n");
			process.exitCode = 2;
		} else {
			process.stdout.write("RESULT: ALL ENGINES PASSED\n");
		}
		process.stdout.write("==============================\n\n");
	}
	return;
}

// --backend was specified — load mechatron and run tests
var _path = require("path");
if (_backendArg !== "napi" && _backendArg !== "ffi" && _backendArg !== "rust") {
	process.stderr.write("Unknown backend: " + _backendArg + "\n");
	process.exitCode = 2;
	return;
}
// Legacy alias: "rust" → "napi"
if (_backendArg === "rust") _backendArg = "napi";
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
