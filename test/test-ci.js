////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Automated CI Test Suite                        //
//                                                                            //
//  Exercises all NAPI backend functions without interactive input.            //
//  Uses the module itself as the counterpart (e.g. set clipboard, then       //
//  read it back; press a key, then check getState).                          //
//                                                                            //
//  Usage:                                                                    //
//    node test-ci.js [tests...] [--backend cpp|rust]                         //
//                                                                            //
//  When --backend is omitted, runs ALL available backends automatically      //
//  as child processes and reports combined results.                           //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

//----------------------------------------------------------------------------//
// Backend selection & dual-backend runner                                     //
//----------------------------------------------------------------------------//

var _allArgs = process.argv.slice (2);
var _backendIdx = _allArgs.indexOf ("--backend");
var _backendArg = (_backendIdx >= 0) ? _allArgs[_backendIdx + 1] : null;
// Remove --backend and its value from the test filter args
var _testArgs = _allArgs.filter (function (_, i) {
	return i !== _backendIdx && i !== _backendIdx + 1;
});

// When no --backend specified, run as dual-backend coordinator
if (!_backendArg)
{
	var _child_process = require ("child_process");
	var _path = require ("path");

	// Discover which backends are available on this platform
	var _backends = [];

	// Probe Rust backend — each subsystem has its own .node; probe via the keyboard package
	var _rustNodeFile = (function () {
		var platform = process.platform;
		var arch = process.arch;
		var map = {
			"linux-x64":    "mechatron-keyboard.linux-x64-gnu.node",
			"linux-arm64":  "mechatron-keyboard.linux-arm64-gnu.node",
			"darwin-x64":   "mechatron-keyboard.darwin-x64.node",
			"darwin-arm64": "mechatron-keyboard.darwin-arm64.node",
			"win32-x64":    "mechatron-keyboard.win32-x64-msvc.node",
			"win32-ia32":   "mechatron-keyboard.win32-ia32-msvc.node",
		};
		return map[platform + "-" + arch] || ("mechatron-keyboard." + platform + "-" + arch + ".node");
	})();

	try {
		require (_path.resolve (__dirname, "..", "packages", "mechatron-keyboard", _rustNodeFile));
		_backends.push ("rust");
	} catch (_) {
		process.stdout.write ("  [skip] Rust backend not available (" + _rustNodeFile + ")\n");
	}

	if (_backends.length === 0)
	{
		process.stdout.write ("\nERROR: No backends available to test!\n");
		process.exitCode = 2;
	}
	else
	{
		var _overallFailed = false;
		process.stdout.write ("\n==============================\n");
		process.stdout.write ("DUAL-BACKEND CI TEST RUNNER\n");
		process.stdout.write ("Backends: " + _backends.join (", ") + "\n");
		process.stdout.write ("==============================\n");

		for (var _bi = 0; _bi < _backends.length; ++_bi)
		{
			var _be = _backends[_bi];
			process.stdout.write ("\n>>> Running tests with " + _be.toUpperCase () + " backend...\n");

			var _childArgs = [__filename].concat (_testArgs).concat (["--backend", _be]);
			var _result = _child_process.spawnSync (process.execPath, _childArgs, {
				stdio: "inherit",
				env: process.env,
				cwd: _path.resolve (__dirname, ".."),
				timeout: 120000,
			});

			if (_result.status !== 0)
			{
				_overallFailed = true;
				process.stdout.write (">>> " + _be.toUpperCase () + " backend: FAILED (exit " + _result.status + ")\n");
			}
			else
			{
				process.stdout.write (">>> " + _be.toUpperCase () + " backend: PASSED\n");
			}
		}

		process.stdout.write ("\n==============================\n");
		if (_overallFailed)
		{
			process.stdout.write ("DUAL-BACKEND RESULT: SOME BACKENDS FAILED\n");
			process.exitCode = 2;
		}
		else
		{
			process.stdout.write ("DUAL-BACKEND RESULT: ALL BACKENDS PASSED\n");
		}
		process.stdout.write ("==============================\n\n");
	}
	// Do NOT fall through to the test code — we're the coordinator process
	return;
}

// --backend was specified — each subsystem package loads its own native module,
// so we don't need to force-load anything. Just accept "rust" as the only option.
var _path = require ("path");
if (_backendArg !== "rust")
{
	process.stderr.write ("Unknown backend: " + _backendArg + "\n");
	process.exitCode = 2;
	return;
}
var mRobot = require ("..");

////////////////////////////////////////////////////////////////////////////////

// On macOS, mach VM operations (used by Memory and Process.getModules) can
// SIGABRT without proper entitlements.  Even with sudo, task_for_pid may
// succeed while subsequent mach_vm_read_overwrite crashes.  Probe once in a
// child process (SIGABRT is not catchable in-process) and record the result.
var gMachVMAvailable = (process.platform !== "darwin");
if (process.platform === "darwin")
{
	var _probePath = require("path").resolve(__dirname, "..").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
	var _child = require ("child_process").spawnSync (process.execPath, ["-e",
		"var m = require('" + _probePath + "');" +
		"var p = m.Process.getCurrent(); var mem = m.Memory(p);" +
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

// Platform capability expectations.  When a capability is expected (true),
// the corresponding probe MUST succeed — a skip becomes a hard failure.
// This prevents regressions from being silently masked by graceful probes.
//
// The key is "platform-arch" (e.g. "darwin-arm64", "win32-x64").
// Capabilities:
//   keyboardSim  — press/release registers in getState
//   mousePos     — setPos round-trips through getPos
//   mouseSim     — press/release registers in getState
//   grabScreen   — Screen.grabScreen returns valid image
//   machVM       — mach VM read/getModules (macOS only)

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

// Check whether skipping a capability is allowed.  If the capability is
// expected for this platform, throw an assertion failure instead of skipping.
function expectOrSkip (capability, label)
{
	if (gExpect[capability])
	{
		assert (false, label + " — expected to work on " + gPlatformKey + " but probe failed (regression!)");
	}
}

////////////////////////////////////////////////////////////////////////////////

function log (msg)
{
	process.stdout.write (msg);
}

////////////////////////////////////////////////////////////////////////////////

function assert (cond, msg)
{
	if (!cond)
	{
		var err = new Error ("Assertion Failed" + (msg ? ": " + msg : "") + "\x07\n");
		throw err;
	}
}

////////////////////////////////////////////////////////////////////////////////

function assertThrows (fn, thisArg, args)
{
	try {
		fn.apply (thisArg, args);
		assert (false, "Expected " + fn.name + " to throw");
	} catch (e) { }
}

////////////////////////////////////////////////////////////////////////////////

// Poll a condition with short sleeps, returning true once it holds.
// CGEventPost is async — HID system state may lag on Apple Silicon.
function waitFor (condFn, timeoutMs)
{
	if (condFn()) return true;
	var step = 5;
	for (var elapsed = 0; elapsed < timeoutMs; elapsed += step)
	{
		mRobot.Timer.sleep (step);
		if (condFn()) return true;
	}
	return false;
}



//----------------------------------------------------------------------------//
// Tests                                                                      //
//----------------------------------------------------------------------------//

////////////////////////////////////////////////////////////////////////////////

function testKeyboard()
{
	log ("  Keyboard... ");

	var Keyboard = mRobot.Keyboard;
	var k = Keyboard();

	// --- compile (purely computational, no display needed) ---
	var list = Keyboard.compile ("{SPACE}");
	assert (list.length === 2, "compile SPACE length");
	assert (list[0].down === true,  "compile SPACE [0].down");
	assert (list[0].key === mRobot.KEY_SPACE, "compile SPACE [0].key");
	assert (list[1].down === false, "compile SPACE [1].down");
	assert (list[1].key === mRobot.KEY_SPACE, "compile SPACE [1].key");

	list = Keyboard.compile ("{TAB}{ESCAPE}");
	assert (list.length === 4, "compile TAB+ESC length");

	list = Keyboard.compile ("{F1}{F2}{F3}{F4}{F5}{F6}{F7}{F8}{F9}{F10}{F11}{F12}");
	assert (list.length === 24, "compile F1-F12 length");

	// Modifier compile
	list = Keyboard.compile ("{SHIFT}{CONTROL}{ALT}");
	assert (list.length === 6, "compile modifiers length");

	// --- click/press/release + getState (needs interactive desktop) ---
	// Probe whether input simulation fully works: press must register,
	// AND release must take effect. Windows Session 0 can queue press
	// via SendInput but release may not process without a message pump.
	// CGEventPost is async on macOS — HID state may lag, so use waitFor.
	k.press (mRobot.KEY_SHIFT);
	var pressWorks = waitFor (function () {
		return Keyboard.getState (mRobot.KEY_SHIFT) === true;
	}, 200);
	k.release (mRobot.KEY_SHIFT);
	var releaseWorks = pressWorks && waitFor (function () {
		return Keyboard.getState (mRobot.KEY_SHIFT) === false;
	}, 200);
	if (releaseWorks)
	{
		k.click (mRobot.KEY_SHIFT);
		assert (waitFor (function () {
			return Keyboard.getState (mRobot.KEY_SHIFT) === false;
		}, 200), "shift released after click");

		k.press (mRobot.KEY_SHIFT);
		assert (waitFor (function () {
			return Keyboard.getState (mRobot.KEY_SHIFT) === true;
		}, 200), "shift pressed");
		k.release (mRobot.KEY_SHIFT);
		assert (waitFor (function () {
			return Keyboard.getState (mRobot.KEY_SHIFT) === false;
		}, 200), "shift released");
	}
	else
	{
		expectOrSkip ("keyboardSim", "Keyboard input simulation");
		log ("(input sim unavailable) ");
	}

	// --- getState() returns object ---
	var state = Keyboard.getState();
	assert (typeof state === "object", "getState returns object");

	log ("OK\n");
	return true;
}

////////////////////////////////////////////////////////////////////////////////

function testMouse()
{
	log ("  Mouse... ");

	var Mouse = mRobot.Mouse;
	var m = Mouse();

	// --- setPos / getPos round-trip ---
	var old = Mouse.getPos();
	assert (typeof old.x === "number" && typeof old.y === "number", "getPos returns point");

	// Probe whether mouse position control works
	Mouse.setPos (100, 200);
	mRobot.Timer.sleep (10); // allow window server to process cursor warp
	var p = Mouse.getPos();
	var mousePosWorks = (p.x === 100 && p.y === 200);
	if (mousePosWorks)
	{
		Mouse.setPos (50, 50);
		p = Mouse.getPos();
		assert (p.x === 50 && p.y === 50, "setPos 50,50: got " + p.x + "," + p.y);
		Mouse.setPos (old);
	}
	else
	{
		expectOrSkip ("mousePos", "Mouse setPos");
		log ("(setPos unavailable) ");
	}

	// Probe whether mouse button simulation fully works (press, release, click).
	// CGEventPost is async on macOS — HID state may lag, so use waitFor.
	m.press (mRobot.BUTTON_LEFT);
	var mousePressWorks = waitFor (function () {
		return Mouse.getState (mRobot.BUTTON_LEFT) === true;
	}, 200);
	m.release (mRobot.BUTTON_LEFT);
	var mouseReleaseWorks = mousePressWorks && waitFor (function () {
		return Mouse.getState (mRobot.BUTTON_LEFT) === false;
	}, 200);
	// Also probe click (atomic press+release): on Windows Session 0,
	// individual press/release may work but click may leave key stuck
	if (mouseReleaseWorks)
	{
		m.click (mRobot.BUTTON_RIGHT);
		mouseReleaseWorks = waitFor (function () {
			return Mouse.getState (mRobot.BUTTON_RIGHT) === false;
		}, 200);
	}
	if (mouseReleaseWorks)
	{
		m.press (mRobot.BUTTON_MID);
		assert (waitFor (function () {
			return Mouse.getState (mRobot.BUTTON_MID) === true;
		}, 200), "mid pressed in state");
		var bState = Mouse.getState();
		assert (typeof bState === "object", "getState returns object");
		assert (bState[mRobot.BUTTON_MID] === true, "mid pressed in state");
		m.release (mRobot.BUTTON_MID);

		m.click (mRobot.BUTTON_LEFT);
		assert (waitFor (function () {
			return Mouse.getState (mRobot.BUTTON_LEFT) === false;
		}, 200), "left released after click");
	}
	else
	{
		expectOrSkip ("mouseSim", "Mouse input simulation");
		log ("(input sim unavailable) ");
		var bState = Mouse.getState();
		assert (typeof bState === "object", "getState returns object");
	}

	// --- scroll (just verify no crash) ---
	m.scrollV (1);
	m.scrollV (-1);
	m.scrollH (1);
	m.scrollH (-1);

	log ("OK\n");
	return true;
}

////////////////////////////////////////////////////////////////////////////////

function testClipboard()
{
	log ("  Clipboard... ");

	var Clipboard = mRobot.Clipboard;
	var Image = mRobot.Image;

	if (process.platform === "linux")
	{
		// Linux X11 clipboard without a clipboard manager — all ops return false
		assert (Clipboard.clear () === false, "linux clear");
		assert (Clipboard.hasText () === false, "linux hasText");
		assert (Clipboard.getText ().length === 0, "linux getText");
		assert (Clipboard.setText ("Hello") === false, "linux setText");

		var img = Image();
		assert (Clipboard.hasImage () === false, "linux hasImage");
		assert (Clipboard.getImage (img) === false, "linux getImage");
		assert (Clipboard.setImage (img) === false, "linux setImage");

		assert (Clipboard.getSequence () === 0, "linux getSequence");

		log ("OK (linux - no clipboard manager)\n");
		return true;
	}

	// --- Mac / Windows: full clipboard testing ---
	// Text round-trip
	assert (Clipboard.setText ("Hello"), "setText Hello");
	assert (Clipboard.hasText (), "hasText after set");
	assert (Clipboard.getText () === "Hello", "getText Hello");

	assert (Clipboard.setText ("World"), "setText World");
	assert (Clipboard.getText () === "World", "getText World");

	// Sequence tracking
	var s1 = Clipboard.getSequence();
	assert (s1 !== 0, "getSequence non-zero");
	assert (Clipboard.getSequence() === s1, "getSequence consistent");

	// Clear
	assert (Clipboard.clear(), "clear");
	assert (Clipboard.hasText() === false, "!hasText after clear");
	assert (Clipboard.getText() === "", "getText empty after clear");
	assert (Clipboard.getSequence() !== s1, "sequence changed after clear");

	// Large text
	var big = new Array (65536).join ("X");
	assert (Clipboard.setText (big), "setText large");
	assert (Clipboard.getText () === big, "getText large round-trip");

	// Image round-trip
	var src = Image (4, 4);
	src.fill (128, 64, 32);
	assert (Clipboard.setImage (src), "setImage");
	assert (Clipboard.hasImage (), "hasImage after set");
	assert (Clipboard.hasText () === false, "!hasText after setImage");

	var dst = Image();
	assert (Clipboard.getImage (dst), "getImage");
	assert (dst.isValid(), "dst valid");
	assert (dst.getWidth () === 4, "dst width");
	assert (dst.getHeight () === 4, "dst height");

	// Cleanup
	Clipboard.clear();

	// Argument validation
	assertThrows (Clipboard.setText,  Clipboard, []);
	assertThrows (Clipboard.setText,  Clipboard, [0]);
	assertThrows (Clipboard.getImage, Clipboard, []);
	assertThrows (Clipboard.setImage, Clipboard, []);

	log ("OK\n");
	return true;
}

////////////////////////////////////////////////////////////////////////////////

function testProcess()
{
	log ("  Process... ");

	var Process = mRobot.Process;

	// --- Invalid process ---
	var p = Process();
	assert (!p.isValid(), "empty invalid");
	assert (p.getPID() === 0, "empty pid=0");
	assert (p.getName() === "", "empty name empty");
	assert (p.getPath() === "", "empty path empty");
	assert (p.hasExited(), "empty hasExited");

	p = Process (8888);
	assert (!p.isValid(), "bogus pid invalid");
	assert (p.getPID() === 8888, "bogus pid stored");

	// Equality on invalid
	var p2 = Process();
	assert (p2.eq (0), "empty eq 0");
	assert (p2.ne (8888), "empty ne 8888");

	// --- getCurrent ---
	var curr = Process.getCurrent();
	assert (curr.isValid(), "current valid");
	assert (curr.getPID() > 0, "current pid > 0");
	assert (curr.getName().length > 0, "current has name");
	assert (curr.getPath().length > 0, "current has path");
	assert (!curr.hasExited(), "current not exited");

	// Open by PID
	var p3 = Process();
	assert (p3.open (curr.getPID()), "open current pid");
	assert (p3.isValid(), "opened valid");
	assert (p3.eq (curr), "opened eq current");

	// --- getList ---
	var list = Process.getList();
	assert (list.length > 0, "getList non-empty");
	assert (list instanceof Array, "getList is array");

	// Each entry should be valid
	for (var i = 0; i < Math.min (list.length, 10); ++i)
	{
		assert (list[i].isValid(), "list[" + i + "] valid");
		assert (list[i].getPID() > 0, "list[" + i + "] pid > 0");
	}

	// Regex filter - we're running as "node", should match
	var filtered = Process.getList (".*node.*");
	assert (filtered.length > 0, "filtered has node");

	// --- isSys64Bit ---
	assert (typeof Process.isSys64Bit() === "boolean", "isSys64Bit bool");

	// --- getModules (uses mach_vm_read on macOS, may SIGABRT) ---
	if (gMachVMAvailable)
	{
		var mods = curr.getModules();
		assert (mods instanceof Array, "getModules is array");
		assert (mods.length > 0, "getModules non-empty");
	}
	else
	{
		expectOrSkip ("machVM", "Process.getModules (mach VM)");
		log ("(getModules unavailable) ");
	}

	// --- is64Bit, isDebugged ---
	assert (typeof curr.is64Bit() === "boolean", "is64Bit bool");
	assert (typeof curr.isDebugged() === "boolean", "isDebugged bool");

	// --- close ---
	curr.close();

	// --- Argument validation ---
	var px = Process();
	assertThrows (px.open, px, []);
	assertThrows (px.eq, px, []);
	assertThrows (px.ne, px, []);

	log ("OK\n");
	return true;
}

////////////////////////////////////////////////////////////////////////////////

function testWindow()
{
	log ("  Window... ");

	var Window = mRobot.Window;
	var Bounds = mRobot.Bounds;
	var Point  = mRobot.Point;

	// --- Invalid window ---
	var w1 = Window();
	var w2 = Window();
	assert (!w1.isValid(), "empty invalid");
	assert (w1.getHandle() === 0, "empty handle=0");
	assert (w1.getTitle() === "", "empty title empty");
	assert (w1.getPID() === 0, "empty pid=0");

	assert (w1.setHandle (0), "setHandle 0");
	assert (!w1.setHandle (8888), "setHandle 8888 fails");

	assert (!w1.isTopMost(), "empty !topmost");
	assert (!w1.isBorderless(), "empty !borderless");
	assert (!w1.isMinimized(), "empty !minimized");
	assert (!w1.isMaximized(), "empty !maximized");

	var b = w1.getBounds();
	assert (b instanceof Bounds, "getBounds returns Bounds");
	assert (b.eq (0), "empty bounds eq 0");

	var c = w1.getClient();
	assert (c instanceof Bounds, "getClient returns Bounds");

	var mp = w1.mapToClient (20, 20);
	assert (mp instanceof Point, "mapToClient returns Point");
	var ms = w1.mapToScreen (20, 20);
	assert (ms instanceof Point, "mapToScreen returns Point");

	// Equality
	assert (w1.eq (w2), "empty eq empty");
	assert (!w1.ne (w2), "empty !ne empty");
	assert (w1.eq (0), "empty eq 0");
	assert (w1.ne (8888), "empty ne 8888");

	// --- getList ---
	var list = Window.getList();
	assert (list instanceof Array, "getList is array");

	// --- getActive ---
	var active = Window.getActive();
	assert (active instanceof Window, "getActive returns Window");

	// --- isAxEnabled ---
	assert (typeof Window.isAxEnabled() === "boolean", "isAxEnabled bool");

	// --- Argument validation ---
	assertThrows (w1.setHandle,     w1, []);
	assertThrows (w1.setTitle,      w1, []);
	assertThrows (w1.setTopMost,    w1, []);
	assertThrows (w1.setBorderless, w1, []);
	assertThrows (w1.setMinimized,  w1, []);
	assertThrows (w1.setMaximized,  w1, []);

	log ("OK\n");
	return true;
}

////////////////////////////////////////////////////////////////////////////////

function testScreen()
{
	log ("  Screen... ");

	var Screen = mRobot.Screen;
	var Bounds = mRobot.Bounds;
	var Image  = mRobot.Image;

	// --- Before synchronize ---
	var tb = Screen.getTotalBounds();
	assert (tb instanceof Bounds, "getTotalBounds returns Bounds");

	// --- synchronize ---
	var synced = Screen.synchronize();
	assert (synced === true, "synchronize returns true");

	var main = Screen.getMain();
	assert (main !== null, "getMain not null");

	var list = Screen.getList();
	assert (list.length > 0, "getList non-empty");
	assert (list[0] === main, "list[0] is main");

	// --- Total bounds/usable ---
	tb = Screen.getTotalBounds();
	var tu = Screen.getTotalUsable();
	assert (tb.isValid(), "totalBounds valid");
	assert (tu.isValid(), "totalUsable valid");

	// --- Screen properties ---
	for (var i = 0; i < list.length; ++i)
	{
		assert (list[i].getBounds().isValid(), "screen " + i + " bounds valid");
		assert (list[i].getUsable().isValid(), "screen " + i + " usable valid");
		assert (list[i].isPortrait() || list[i].isLandscape(),
			"screen " + i + " is portrait or landscape");
	}

	// --- isCompositing ---
	assert (typeof Screen.isCompositing() === "boolean", "isCompositing bool");

	if (process.platform === "linux" || process.platform === "darwin")
	{
		assert (Screen.isCompositing(), "compositing true on linux/mac");
		Screen.setCompositing (false);
		assert (Screen.isCompositing(), "compositing stays true on linux/mac");
		Screen.setCompositing (true);
	}

	// --- grabScreen (needs kTCCServiceScreenCapture on macOS) ---
	var img = Image();
	var result = Screen.grabScreen (img, 0, 0, 100, 100);
	if (result)
	{
		assert (img.isValid(), "grabbed image valid");
		assert (img.getWidth() === 100, "grabbed width 100");
		assert (img.getHeight() === 100, "grabbed height 100");

		// Grab with bounds
		var img2 = Image();
		var bounds = Bounds (0, 0, 50, 50);
		result = Screen.grabScreen (img2, bounds);
		assert (result === true, "grabScreen with bounds");
		assert (img2.isValid(), "grabbed2 valid");
	}
	else
	{
		expectOrSkip ("grabScreen", "Screen.grabScreen");
		log ("(grabScreen unavailable) ");
	}

	log ("OK\n");
	return true;
}

////////////////////////////////////////////////////////////////////////////////

function testMemory()
{
	log ("  Memory... ");

	var Module  = mRobot.Module;

	// --- Module (data type only, no native calls) ---
	var mod = Module();
	assert (mod.valid === false, "empty module invalid");
	assert (mod.name === "", "empty module name");
	assert (mod.base === 0, "empty module base");
	assert (mod.size === 0, "empty module size");
	assert (mod.isValid() === false, "empty module isValid");
	assert (mod.getName() === "", "empty module getName");
	assert (mod.getBase() === 0, "empty module getBase");
	assert (mod.getSize() === 0, "empty module getSize");

	var Process = mRobot.Process;
	var Memory  = mRobot.Memory;

	// On macOS, mach VM operations can SIGABRT without proper entitlements.
	// The global probe (gMachVMAvailable) already tested this at startup.
	if (!gMachVMAvailable)
	{
		expectOrSkip ("machVM", "Memory (mach VM)");
		log ("(macOS mach VM unavailable) OK\n");
		return true;
	}

	// --- Invalid memory ---
	var mem = Memory();
	assert (!mem.isValid(), "empty invalid");

	var proc = Process();
	mem = Memory (proc);
	assert (!mem.isValid(), "invalid proc -> invalid mem");
	assert (mem.getProcess().eq (proc), "getProcess eq");

	// Invalid reads/writes
	var buf = Buffer.alloc (1);
	assert (mem.readData (0, buf, 1) === 0, "invalid readData");
	assert (mem.writeData (0, buf, 1) === 0, "invalid writeData");

	// Invalid regions
	assert (!mem.getRegion(0).valid, "invalid getRegion 0");
	assert (mem.getRegions().length === 0, "invalid getRegions empty");

	// Invalid find
	assert (mem.find ("  ").length === 0, "invalid find empty");

	// --- Open current process ---
	proc = Process.getCurrent();
	mem = Memory (proc);
	assert (mem.isValid(), "current mem valid");

	// Ptr size
	var ptrSize = mem.getPtrSize();
	assert (ptrSize === 4 || ptrSize === 8, "ptrSize 4 or 8");

	// Min/max address, page size
	var minAddr = mem.getMinAddress();
	var maxAddr = mem.getMaxAddress();
	var pageSize = mem.getPageSize();
	assert (minAddr >= 0, "minAddress >= 0");
	assert (maxAddr > 0, "maxAddress > 0");
	assert (maxAddr > minAddr, "maxAddress > minAddress");
	assert (pageSize > 0, "pageSize > 0");

	// --- Regions and read operations ---
	var regions = mem.getRegions();
	assert (regions.length > 0, "regions non-empty");

	// Find a readable region
	var readable = null;
	for (var i = 0; i < regions.length; ++i)
	{
		if (regions[i].valid && regions[i].bound && regions[i].readable && regions[i].size > 16)
		{
			readable = regions[i];
			break;
		}
	}

	assert (readable !== null, "found readable region");

	// --- Read from readable region ---
	buf = Buffer.alloc (16);
	var bytesRead = mem.readData (readable.start, buf, 16);
	assert (bytesRead === 16, "readData 16 bytes");

	// --- getRegion for known address ---
	var region = mem.getRegion (readable.start);
	assert (region.valid, "getRegion valid");
	assert (region.bound, "getRegion bound");
	assert (region.readable, "getRegion readable");

	// --- Cache operations ---
	assert (typeof mem.isCaching() === "boolean", "isCaching bool");
	assert (typeof mem.getCacheSize() === "number", "getCacheSize number");

	// Modules of current process
	var mods = proc.getModules();
	assert (mods.length > 0, "current proc has modules");

	proc.close();

	log ("OK\n");
	return true;
}

////////////////////////////////////////////////////////////////////////////////

function testTypes()
{
	log ("  Types (quick)... ");

	var Range  = mRobot.Range;
	var Point  = mRobot.Point;
	var Size   = mRobot.Size;
	var Bounds = mRobot.Bounds;
	var Color  = mRobot.Color;
	var Image  = mRobot.Image;
	var Timer  = mRobot.Timer;

	// Range
	var r = Range (10, 20);
	assert (r.min === 10 && r.max === 20, "Range ctor");
	assert (r.getRange() === 10, "Range getRange");

	// Point
	var p = Point (5, 10);
	assert (p.x === 5 && p.y === 10, "Point ctor");
	assert (p.eq (Point (5, 10)), "Point eq");

	// Size
	var s = Size (100, 200);
	assert (s.w === 100 && s.h === 200, "Size ctor");

	// Bounds
	var b = Bounds (10, 20, 100, 200);
	assert (b.x === 10 && b.y === 20 && b.w === 100 && b.h === 200, "Bounds ctor");
	assert (b.isValid(), "Bounds valid");

	// Color
	var c = Color (128, 64, 32, 255);
	assert (c.r === 128 && c.g === 64 && c.b === 32 && c.a === 255, "Color ctor");

	// Image
	var img = Image (10, 10);
	assert (img.isValid(), "Image valid");
	assert (img.getWidth() === 10, "Image width");
	assert (img.getHeight() === 10, "Image height");
	assert (img.getLength() === 100, "Image length");

	img.setPixel (0, 0, Color (255, 0, 0, 255));
	var px = img.getPixel (0, 0);
	assert (px.r === 255 && px.g === 0 && px.b === 0, "Image pixel");

	img.fill (100, 200, 50);
	px = img.getPixel (5, 5);
	assert (px.r === 100 && px.g === 200 && px.b === 50, "Image fill");

	// Timer
	var t = Timer();
	assert (typeof t.getElapsed() === "number", "Timer elapsed");
	Timer.sleep (10);

	log ("OK\n");
	return true;
}



//----------------------------------------------------------------------------//
// Main                                                                       //
//----------------------------------------------------------------------------//

////////////////////////////////////////////////////////////////////////////////

function main()
{
	log ("\nMECHATRON CI TEST SUITE [" + _backendArg.toUpperCase() + " backend]\n");
	log ("------------------------------\n");
	log ("Platform: " + process.platform + " " + process.arch + "\n");
	log ("Node: " + process.version + "\n");
	log ("UID: " + (process.getuid ? process.getuid() : "N/A") + "\n");
	log ("Backend: " + _backendArg + "\n");
	if (process.platform === "darwin")
		log ("Mach VM: " + (gMachVMAvailable ? "available" : "unavailable") + "\n");
	var expectKeys = Object.keys (gExpect);
	if (expectKeys.length > 0)
	{
		var required = expectKeys.filter (function (k) { return gExpect[k]; });
		log ("Expected: " + (required.length > 0 ? required.join (", ") : "(none)") + "\n");
	}
	else
	{
		log ("Expected: (no expectations defined for " + gPlatformKey + ")\n");
	}
	log ("------------------------------\n\n");

	var tests = [
		["types",     testTypes],
		["keyboard",  testKeyboard],
		["mouse",     testMouse],
		["clipboard", testClipboard],
		["process",   testProcess],
		["window",    testWindow],
		["screen",    testScreen],
		["memory",    testMemory],
	];

	// Parse command line for specific tests
	var requested = _testArgs;
	if (requested.length > 0 && requested[0] !== "all")
	{
		tests = tests.filter (function (t) {
			return requested.indexOf (t[0]) >= 0;
		});
	}

	var failed = false;
	for (var i = 0; i < tests.length; ++i)
	{
		try {
			tests[i][1]();
		} catch (e) {
			log ("  FAILED: " + tests[i][0] + " - " + e.message + "\n");
			if (e.stack) log ("  " + e.stack.split("\n").slice(0,3).join("\n  ") + "\n");
			failed = true;
		}
	}

	log ("\n------------------------------\n");
	if (failed) {
		log ("SOME TESTS FAILED\n");
		return 2;
	}
	log ("ALL TESTS PASSED\n\n");
	return 0;
}

process.exitCode = main();
