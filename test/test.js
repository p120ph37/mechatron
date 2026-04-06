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
var _backendIdx = _allArgs.indexOf("--backend");
var _backendArg = (_backendIdx >= 0) ? _allArgs[_backendIdx + 1] : null;
var _testArgs = (_backendIdx >= 0) ? _allArgs.filter(function (_, i) {
	return i !== _backendIdx && i !== _backendIdx + 1;
}) : _allArgs.slice();

// When no --backend specified, run as dual-backend coordinator
if (!_backendArg) {
	var _child_process = require("child_process");
	var _path = require("path");

	var _backends = [];

	// Probe Rust backend
	try {
		var _probe = require(_path.resolve(__dirname, ".."));
		new _probe.Keyboard();
		_backends.push("rust");
	} catch (_e) {
		process.stdout.write("  [skip] Rust backend not available (" + _e.message + ")\n");
	}

	if (_backends.length === 0) {
		process.stdout.write("\nERROR: No backends available to test!\n");
		process.exitCode = 2;
	} else {
		var _overallFailed = false;
		process.stdout.write("\n==============================\n");
		process.stdout.write("MECHATRON TEST RUNNER\n");
		process.stdout.write("Backends: " + _backends.join(", ") + "\n");
		process.stdout.write("==============================\n");

		for (var _bi = 0; _bi < _backends.length; ++_bi) {
			var _be = _backends[_bi];
			process.stdout.write("\n>>> Running tests with " + _be.toUpperCase() + " backend...\n");

			var _childArgs = [__filename].concat(_testArgs).concat(["--backend", _be]);
			var _result = _child_process.spawnSync(process.execPath, _childArgs, {
				stdio: "inherit",
				env: process.env,
				cwd: _path.resolve(__dirname, ".."),
				timeout: 120000,
			});

			if (_result.status !== 0) {
				_overallFailed = true;
				process.stdout.write(">>> " + _be.toUpperCase() + " backend: FAILED (exit " + _result.status + ")\n");
			} else {
				process.stdout.write(">>> " + _be.toUpperCase() + " backend: PASSED\n");
			}
		}

		process.stdout.write("\n==============================\n");
		if (_overallFailed) {
			process.stdout.write("RESULT: SOME BACKENDS FAILED\n");
			process.exitCode = 2;
		} else {
			process.stdout.write("RESULT: ALL BACKENDS PASSED\n");
		}
		process.stdout.write("==============================\n\n");
	}
	return;
}

// --backend was specified — load mechatron and run tests
var _path = require("path");
if (_backendArg !== "rust") {
	process.stderr.write("Unknown backend: " + _backendArg + "\n");
	process.exitCode = 2;
	return;
}
var mechatron = require("..");

////////////////////////////////////////////////////////////////////////////////

// On macOS, mach VM operations can SIGABRT without proper entitlements.
// Probe once in a child process and record the result.
var gMachVMAvailable = (process.platform !== "darwin");
if (process.platform === "darwin") {
	var _probePath = require("path").resolve(__dirname, "..").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
	var _child = require("child_process").spawnSync(process.execPath, ["-e",
		"var m = require('" + _probePath + "');" +
		"var p = m.Process.getCurrent(); var mem = new m.Memory(p);" +
		"if (!mem.isValid()) process.exit(1);" +
		"var regions = mem.getRegions();" +
		"if (regions.length === 0) process.exit(1);" +
		"var buf = Buffer.alloc(16);" +
		"for (var i = 0; i < regions.length; i++) {" +
		"  if (regions[i].valid && regions[i].readable && regions[i].size > 16) {" +
		"    mem.readData(regions[i].start, buf, 16); break;" +
		"  }" +
		"}" +
		"var mods = p.getModules();" +
		"if (mods.length === 0) process.exit(1);" +
		"process.exit(0);"
	], { timeout: 10000, stdio: "ignore" });
	gMachVMAvailable = (_child.status === 0);
}

////////////////////////////////////////////////////////////////////////////////

// Platform capability expectations
var gExpected = {
	"linux-x64":     { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true,  machVM: false },
	"linux-arm64":   { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true,  machVM: false },
	"darwin-arm64":  { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true,  machVM: true  },
	"darwin-x64":    { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true,  machVM: true  },
	"win32-x64":     { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true,  machVM: false },
	"win32-ia32":    { keyboardSim: true, mousePos: true, mouseSim: true, grabScreen: true,  machVM: false },
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
var processModule   = require("./process")(mechatron, log, assert, waitFor, expectOrSkip, gMachVMAvailable);
var windowModule    = require("./window")(mechatron, log, assert, waitFor, expectOrSkip);
var screenModule    = require("./screen")(mechatron, log, assert, waitFor, expectOrSkip);
var memoryModule    = require("./memory")(mechatron, log, assert, waitFor, expectOrSkip, gMachVMAvailable);

////////////////////////////////////////////////////////////////////////////////

function main() {
	log("\nMECHATRON TEST SUITE [" + _backendArg.toUpperCase() + " backend]\n");
	log("------------------------------\n");
	log("Platform: " + process.platform + " " + process.arch + "\n");
	log("Node: " + process.version + "\n");
	log("UID: " + (process.getuid ? process.getuid() : "N/A") + "\n");
	log("Backend: " + _backendArg + "\n");
	if (process.platform === "darwin")
		log("Mach VM: " + (gMachVMAvailable ? "available" : "unavailable") + "\n");
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
	for (var i = 0; i < tests.length; ++i) {
		try {
			tests[i][1]();
		} catch (e) {
			log("  FAILED: " + tests[i][0] + " - " + e.message + "\n");
			if (e.stack) log("  " + e.stack.split("\n").slice(0, 3).join("\n  ") + "\n");
			failed = true;
		}
	}

	log("\n------------------------------\n");
	if (failed) {
		log("SOME TESTS FAILED\n");
		return 2;
	}
	log("ALL TESTS PASSED\n\n");
	return 0;
}

process.exitCode = main();
