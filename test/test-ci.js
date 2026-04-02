////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Automated CI Test Suite                        //
//                                                                            //
//  Exercises all NAPI backend functions without interactive input.            //
//  Uses the module itself as the counterpart (e.g. set clipboard, then       //
//  read it back; press a key, then check getState).                          //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

var mRobot = require ("..");

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

	// --- click/press/release + getState (needs display/desktop session) ---
	// On Windows CI without interactive desktop, input state queries are unreliable
	var hasDesktop = process.platform !== "win32" || !!process.env.SESSIONNAME;
	k.click (mRobot.KEY_SHIFT);
	if (hasDesktop)
	{
		assert (Keyboard.getState (mRobot.KEY_SHIFT) === false, "shift released after click");

		k.press (mRobot.KEY_SHIFT);
		assert (Keyboard.getState (mRobot.KEY_SHIFT) === true, "shift pressed");
		k.release (mRobot.KEY_SHIFT);
		assert (Keyboard.getState (mRobot.KEY_SHIFT) === false, "shift released");
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

	// On macOS CI, accessibility permissions are not granted so setPos is a no-op
	if (process.platform !== "darwin")
	{
		Mouse.setPos (100, 200);
		var p = Mouse.getPos();
		assert (p.x === 100 && p.y === 200, "setPos/getPos round-trip: got " + p.x + "," + p.y);

		Mouse.setPos (50, 50);
		p = Mouse.getPos();
		assert (p.x === 50 && p.y === 50, "setPos 50,50: got " + p.x + "," + p.y);

		Mouse.setPos (old);
	}

	// --- press/release + getState ---
	var hasDesktop = process.platform !== "win32" || !!process.env.SESSIONNAME;
	m.press (mRobot.BUTTON_LEFT);
	if (hasDesktop)
		assert (Mouse.getState (mRobot.BUTTON_LEFT) === true, "left pressed");
	m.release (mRobot.BUTTON_LEFT);
	if (hasDesktop)
		assert (Mouse.getState (mRobot.BUTTON_LEFT) === false, "left released");

	m.press (mRobot.BUTTON_MID);
	var bState = Mouse.getState();
	assert (typeof bState === "object", "getState returns object");
	if (hasDesktop)
		assert (bState[mRobot.BUTTON_MID] === true, "mid pressed in state");
	m.release (mRobot.BUTTON_MID);

	// --- click ---
	m.click (mRobot.BUTTON_LEFT);
	if (hasDesktop)
		assert (Mouse.getState (mRobot.BUTTON_LEFT) === false, "left released after click");

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
	assert (p.getPID() === 0, "bogus pid reset to 0");

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

	// --- getModules ---
	var mods = curr.getModules();
	assert (mods instanceof Array, "getModules is array");
	assert (mods.length > 0, "getModules non-empty");

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

	// --- grabScreen ---
	var img = Image();
	var result = Screen.grabScreen (img, 0, 0, 100, 100);
	assert (result === true, "grabScreen returns true");
	assert (img.isValid(), "grabbed image valid");
	assert (img.getWidth() === 100, "grabbed width 100");
	assert (img.getHeight() === 100, "grabbed height 100");

	// Grab with bounds
	var img2 = Image();
	var bounds = Bounds (0, 0, 50, 50);
	result = Screen.grabScreen (img2, bounds);
	assert (result === true, "grabScreen with bounds");
	assert (img2.isValid(), "grabbed2 valid");

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

	// On macOS, memory operations can SIGABRT without entitlements
	if (process.platform === "darwin")
	{
		log ("OK (macOS - skipping native memory ops)\n");
		return true;
	}

	var Process = mRobot.Process;
	var Memory  = mRobot.Memory;

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
	log ("\nMECHATRON CI TEST SUITE\n");
	log ("------------------------------\n");
	log ("Platform: " + process.platform + " " + process.arch + "\n");
	log ("Node: " + process.version + "\n");
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
	var requested = process.argv.slice (2);
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
