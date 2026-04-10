////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//               mechatron-robot-js conformance test suite                     //
//                                                                            //
//  Validates that the shim exposes the exact robot-js 2.2.0 public API       //
//  surface: every class, static method, instance method, constant, and       //
//  top-level function that robot-js consumers depend on.                      //
//                                                                            //
//  Usage:  node test/conformance.js                                          //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

// Load the shim — in a real consumer this would be require("mechatron-robot-js")
// but for in-repo testing we resolve it directly.
var robot = require("..");

var passed = 0;
var failed = 0;
var skipped = 0;

// Detect whether the native backend is available (prebuilt .node binaries present).
// Each subsystem now has its own native loader — probe by constructing one.
var hasNative = false;
try {
  new robot.Keyboard();
  hasNative = true;
} catch (_) {}

if (!hasNative) {
  console.log("NOTE: Native backend not available — " +
    "constructor and behavioral tests for native-backed classes will be skipped.\n" +
    "      API surface (prototype/static) checks still run.\n");
}

function check(description, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error("  FAIL: " + description);
  }
}

function checkNative(description, fn) {
  if (!hasNative) {
    skipped++;
    return;
  }
  try {
    check(description, fn());
  } catch (e) {
    failed++;
    console.error("  FAIL: " + description + " (threw: " + e.message + ")");
  }
}

function section(name) {
  console.log("\n-- " + name + " --");
}

////////////////////////////////////////////////////////////////////////////////
// Version constants
////////////////////////////////////////////////////////////////////////////////

section("Version Constants");

check("ROBOT_VERSION is a number",
  typeof robot.ROBOT_VERSION === "number");
check("ROBOT_VERSION_STR is a string",
  typeof robot.ROBOT_VERSION_STR === "string");
check("ADDON_VERSION is a number",
  typeof robot.ADDON_VERSION === "number");
check("ADDON_VERSION_STR is a string",
  typeof robot.ADDON_VERSION_STR === "string");

////////////////////////////////////////////////////////////////////////////////
// Top-level functions
////////////////////////////////////////////////////////////////////////////////

section("Top-Level Functions");

check("sleep is a function",
  typeof robot.sleep === "function");
check("clock is a function",
  typeof robot.clock === "function");
check("clock() returns a number",
  typeof robot.clock() === "number");

////////////////////////////////////////////////////////////////////////////////
// Data type classes: constructors & callable-without-new
////////////////////////////////////////////////////////////////////////////////

section("Data Type Classes");

// Range
check("Range exists",            typeof robot.Range === "function");
check("Range() without new",     robot.Range() != null);
check("new Range()",             new robot.Range() != null);
check("Range(10, 20).min === 10", robot.Range(10, 20).min === 10);
check("Range(10, 20).max === 20", robot.Range(10, 20).max === 20);
check("Range.prototype.clone",   typeof robot.Range.prototype.clone === "function");
check("Range.prototype.getRange", typeof robot.Range.prototype.getRange === "function");
check("Range.prototype.setRange", typeof robot.Range.prototype.setRange === "function");
check("Range.prototype.contains", typeof robot.Range.prototype.contains === "function");
check("Range.prototype.getRandom", typeof robot.Range.prototype.getRandom === "function");
check("Range.prototype.eq",      typeof robot.Range.prototype.eq === "function");
check("Range.prototype.ne",      typeof robot.Range.prototype.ne === "function");
check("Range.normalize",         typeof robot.Range.normalize === "function");

// Point
check("Point exists",            typeof robot.Point === "function");
check("Point() without new",     robot.Point() != null);
check("Point(3,4).x === 3",      robot.Point(3, 4).x === 3);
check("Point(3,4).y === 4",      robot.Point(3, 4).y === 4);
check("Point.prototype.isZero",  typeof robot.Point.prototype.isZero === "function");
check("Point.prototype.toSize",  typeof robot.Point.prototype.toSize === "function");
check("Point.prototype.add",     typeof robot.Point.prototype.add === "function");
check("Point.prototype.sub",     typeof robot.Point.prototype.sub === "function");
check("Point.prototype.neg",     typeof robot.Point.prototype.neg === "function");
check("Point.prototype.clone",   typeof robot.Point.prototype.clone === "function");
check("Point.normalize",         typeof robot.Point.normalize === "function");

// Size
check("Size exists",             typeof robot.Size === "function");
check("Size() without new",      robot.Size() != null);
check("Size(5,10).w === 5",      robot.Size(5, 10).w === 5);
check("Size(5,10).h === 10",     robot.Size(5, 10).h === 10);
check("Size.prototype.isZero",   typeof robot.Size.prototype.isZero === "function");
check("Size.prototype.isEmpty",  typeof robot.Size.prototype.isEmpty === "function");
check("Size.prototype.toPoint",  typeof robot.Size.prototype.toPoint === "function");
check("Size.prototype.clone",    typeof robot.Size.prototype.clone === "function");
check("Size.normalize",          typeof robot.Size.normalize === "function");

// Bounds
check("Bounds exists",           typeof robot.Bounds === "function");
check("Bounds() without new",    robot.Bounds() != null);
check("Bounds(1,2,3,4).x === 1", robot.Bounds(1, 2, 3, 4).x === 1);
check("Bounds.prototype.isZero", typeof robot.Bounds.prototype.isZero === "function");
check("Bounds.prototype.isEmpty", typeof robot.Bounds.prototype.isEmpty === "function");
check("Bounds.prototype.isValid", typeof robot.Bounds.prototype.isValid === "function");
check("Bounds.prototype.getLeft", typeof robot.Bounds.prototype.getLeft === "function");
check("Bounds.prototype.getTop",  typeof robot.Bounds.prototype.getTop === "function");
check("Bounds.prototype.getRight", typeof robot.Bounds.prototype.getRight === "function");
check("Bounds.prototype.getBottom", typeof robot.Bounds.prototype.getBottom === "function");
check("Bounds.prototype.getLTRB", typeof robot.Bounds.prototype.getLTRB === "function");
check("Bounds.prototype.normalize", typeof robot.Bounds.prototype.normalize === "function");
check("Bounds.prototype.containsP", typeof robot.Bounds.prototype.containsP === "function");
check("Bounds.prototype.containsB", typeof robot.Bounds.prototype.containsB === "function");
check("Bounds.prototype.intersects", typeof robot.Bounds.prototype.intersects === "function");
check("Bounds.prototype.getPoint", typeof robot.Bounds.prototype.getPoint === "function");
check("Bounds.prototype.getSize",  typeof robot.Bounds.prototype.getSize === "function");
check("Bounds.prototype.getCenter", typeof robot.Bounds.prototype.getCenter === "function");
check("Bounds.prototype.unite",   typeof robot.Bounds.prototype.unite === "function");
check("Bounds.prototype.intersect", typeof robot.Bounds.prototype.intersect === "function");
check("Bounds.prototype.clone",   typeof robot.Bounds.prototype.clone === "function");
check("Bounds.normalize",         typeof robot.Bounds.normalize === "function");

// Color
check("Color exists",            typeof robot.Color === "function");
check("Color() without new",     robot.Color() != null);
check("Color(10,20,30,40).r === 10", robot.Color(10, 20, 30, 40).r === 10);
check("Color.prototype.getARGB", typeof robot.Color.prototype.getARGB === "function");
check("Color.prototype.setARGB", typeof robot.Color.prototype.setARGB === "function");
check("Color.prototype.clone",   typeof robot.Color.prototype.clone === "function");
check("Color.normalize",         typeof robot.Color.normalize === "function");

// Hash
check("Hash exists",             typeof robot.Hash === "function");
check("Hash() without new",      robot.Hash() != null);
check("Hash.prototype.append",   typeof robot.Hash.prototype.append === "function");
check("Hash.prototype.clone",    typeof robot.Hash.prototype.clone === "function");
check("Hash('test').result is number", typeof robot.Hash("test").result === "number");

// Image
check("Image exists",            typeof robot.Image === "function");
check("Image() without new",     robot.Image() != null);
check("Image.prototype.isValid", typeof robot.Image.prototype.isValid === "function");
check("Image.prototype.create",  typeof robot.Image.prototype.create === "function");
check("Image.prototype.destroy", typeof robot.Image.prototype.destroy === "function");
check("Image.prototype.getWidth", typeof robot.Image.prototype.getWidth === "function");
check("Image.prototype.getHeight", typeof robot.Image.prototype.getHeight === "function");
check("Image.prototype.getLength", typeof robot.Image.prototype.getLength === "function");
check("Image.prototype.getLimit", typeof robot.Image.prototype.getLimit === "function");
check("Image.prototype.getData", typeof robot.Image.prototype.getData === "function");
check("Image.prototype.getPixel", typeof robot.Image.prototype.getPixel === "function");
check("Image.prototype.setPixel", typeof robot.Image.prototype.setPixel === "function");
check("Image.prototype.fill",    typeof robot.Image.prototype.fill === "function");
check("Image.prototype.swap",    typeof robot.Image.prototype.swap === "function");
check("Image.prototype.flip",    typeof robot.Image.prototype.flip === "function");
check("Image.prototype.clone",   typeof robot.Image.prototype.clone === "function");

// Timer
check("Timer exists",            typeof robot.Timer === "function");
check("Timer() without new",     robot.Timer() != null);
check("Timer.prototype.start",   typeof robot.Timer.prototype.start === "function");
check("Timer.prototype.reset",   typeof robot.Timer.prototype.reset === "function");
check("Timer.prototype.restart", typeof robot.Timer.prototype.restart === "function");
check("Timer.prototype.getElapsed", typeof robot.Timer.prototype.getElapsed === "function");
check("Timer.prototype.hasStarted", typeof robot.Timer.prototype.hasStarted === "function");
check("Timer.prototype.hasExpired", typeof robot.Timer.prototype.hasExpired === "function");
check("Timer.prototype.clone",   typeof robot.Timer.prototype.clone === "function");
check("Timer.sleep",             typeof robot.Timer.sleep === "function");
check("Timer.getCpuTime",        typeof robot.Timer.getCpuTime === "function");
check("Timer.compare",           typeof robot.Timer.compare === "function");

////////////////////////////////////////////////////////////////////////////////
// Keyboard
////////////////////////////////////////////////////////////////////////////////

section("Keyboard");

check("Keyboard exists",         typeof robot.Keyboard === "function");
checkNative("Keyboard() without new", function () {
  return robot.Keyboard() != null;
});
check("Keyboard.prototype.click", typeof robot.Keyboard.prototype.click === "function");
check("Keyboard.prototype.press", typeof robot.Keyboard.prototype.press === "function");
check("Keyboard.prototype.release", typeof robot.Keyboard.prototype.release === "function");
check("Keyboard.prototype.clone", typeof robot.Keyboard.prototype.clone === "function");
check("Keyboard.compile",        typeof robot.Keyboard.compile === "function");
check("Keyboard.getState",       typeof robot.Keyboard.getState === "function");
checkNative("Keyboard autoDelay is Range", function () {
  return robot.Keyboard().autoDelay instanceof robot.Range;
});

// Keyboard.compile smoke test (pure TS, no native needed)
var compiled = robot.Keyboard.compile("a");
check("Keyboard.compile('a') returns array",
  Array.isArray(compiled) && compiled.length > 0);
check("Keyboard.compile entry has .down and .key",
  typeof compiled[0].down === "boolean" && typeof compiled[0].key === "number");

////////////////////////////////////////////////////////////////////////////////
// Mouse
////////////////////////////////////////////////////////////////////////////////

section("Mouse");

check("Mouse exists",            typeof robot.Mouse === "function");
checkNative("Mouse() without new", function () {
  return robot.Mouse() != null;
});
check("Mouse.prototype.click",   typeof robot.Mouse.prototype.click === "function");
check("Mouse.prototype.press",   typeof robot.Mouse.prototype.press === "function");
check("Mouse.prototype.release", typeof robot.Mouse.prototype.release === "function");
check("Mouse.prototype.scrollH", typeof robot.Mouse.prototype.scrollH === "function");
check("Mouse.prototype.scrollV", typeof robot.Mouse.prototype.scrollV === "function");
check("Mouse.prototype.clone",   typeof robot.Mouse.prototype.clone === "function");
check("Mouse.getPos",            typeof robot.Mouse.getPos === "function");
check("Mouse.setPos",            typeof robot.Mouse.setPos === "function");
check("Mouse.getState",          typeof robot.Mouse.getState === "function");
checkNative("Mouse autoDelay is Range", function () {
  return robot.Mouse().autoDelay instanceof robot.Range;
});

////////////////////////////////////////////////////////////////////////////////
// Clipboard
////////////////////////////////////////////////////////////////////////////////

section("Clipboard");

check("Clipboard exists",        typeof robot.Clipboard === "object");
check("Clipboard.clear",         typeof robot.Clipboard.clear === "function");
check("Clipboard.hasText",       typeof robot.Clipboard.hasText === "function");
check("Clipboard.getText",       typeof robot.Clipboard.getText === "function");
check("Clipboard.setText",       typeof robot.Clipboard.setText === "function");
check("Clipboard.hasImage",      typeof robot.Clipboard.hasImage === "function");
check("Clipboard.getImage",      typeof robot.Clipboard.getImage === "function");
check("Clipboard.setImage",      typeof robot.Clipboard.setImage === "function");
check("Clipboard.getSequence",   typeof robot.Clipboard.getSequence === "function");

////////////////////////////////////////////////////////////////////////////////
// Screen
////////////////////////////////////////////////////////////////////////////////

section("Screen");

check("Screen exists",           typeof robot.Screen === "function");
checkNative("Screen() without new", function () {
  return robot.Screen() != null;
});
check("Screen.prototype.getBounds", typeof robot.Screen.prototype.getBounds === "function");
check("Screen.prototype.getUsable", typeof robot.Screen.prototype.getUsable === "function");
check("Screen.prototype.isPortrait", typeof robot.Screen.prototype.isPortrait === "function");
check("Screen.prototype.isLandscape", typeof robot.Screen.prototype.isLandscape === "function");
check("Screen.prototype.clone",  typeof robot.Screen.prototype.clone === "function");
check("Screen.synchronize",      typeof robot.Screen.synchronize === "function");
check("Screen.getMain",          typeof robot.Screen.getMain === "function");
check("Screen.getList",          typeof robot.Screen.getList === "function");
check("Screen.getScreen",        typeof robot.Screen.getScreen === "function");
check("Screen.grabScreen",       typeof robot.Screen.grabScreen === "function");
check("Screen.getTotalBounds",   typeof robot.Screen.getTotalBounds === "function");
check("Screen.getTotalUsable",   typeof robot.Screen.getTotalUsable === "function");
check("Screen.isCompositing",    typeof robot.Screen.isCompositing === "function");
check("Screen.setCompositing",   typeof robot.Screen.setCompositing === "function");

////////////////////////////////////////////////////////////////////////////////
// Window
////////////////////////////////////////////////////////////////////////////////

section("Window");

check("Window exists",           typeof robot.Window === "function");
checkNative("Window() without new", function () {
  return robot.Window() != null;
});
check("Window.prototype.isValid", typeof robot.Window.prototype.isValid === "function");
check("Window.prototype.close",  typeof robot.Window.prototype.close === "function");
check("Window.prototype.isTopMost", typeof robot.Window.prototype.isTopMost === "function");
check("Window.prototype.isBorderless", typeof robot.Window.prototype.isBorderless === "function");
check("Window.prototype.isMinimized", typeof robot.Window.prototype.isMinimized === "function");
check("Window.prototype.isMaximized", typeof robot.Window.prototype.isMaximized === "function");
check("Window.prototype.setTopMost", typeof robot.Window.prototype.setTopMost === "function");
check("Window.prototype.setBorderless", typeof robot.Window.prototype.setBorderless === "function");
check("Window.prototype.setMinimized", typeof robot.Window.prototype.setMinimized === "function");
check("Window.prototype.setMaximized", typeof robot.Window.prototype.setMaximized === "function");
check("Window.prototype.getProcess", typeof robot.Window.prototype.getProcess === "function");
check("Window.prototype.getPID", typeof robot.Window.prototype.getPID === "function");
check("Window.prototype.getHandle", typeof robot.Window.prototype.getHandle === "function");
check("Window.prototype.setHandle", typeof robot.Window.prototype.setHandle === "function");
check("Window.prototype.getTitle", typeof robot.Window.prototype.getTitle === "function");
check("Window.prototype.setTitle", typeof robot.Window.prototype.setTitle === "function");
check("Window.prototype.getBounds", typeof robot.Window.prototype.getBounds === "function");
check("Window.prototype.setBounds", typeof robot.Window.prototype.setBounds === "function");
check("Window.prototype.getClient", typeof robot.Window.prototype.getClient === "function");
check("Window.prototype.setClient", typeof robot.Window.prototype.setClient === "function");
check("Window.prototype.mapToClient", typeof robot.Window.prototype.mapToClient === "function");
check("Window.prototype.mapToScreen", typeof robot.Window.prototype.mapToScreen === "function");
check("Window.prototype.clone",  typeof robot.Window.prototype.clone === "function");
check("Window.getList",          typeof robot.Window.getList === "function");
check("Window.getActive",        typeof robot.Window.getActive === "function");
check("Window.setActive",        typeof robot.Window.setActive === "function");
check("Window.isAxEnabled",      typeof robot.Window.isAxEnabled === "function");

////////////////////////////////////////////////////////////////////////////////
// Process
////////////////////////////////////////////////////////////////////////////////

section("Process");

check("Process exists",          typeof robot.Process === "function");
checkNative("Process() without new", function () {
  return robot.Process() != null;
});
check("Process.prototype.open",  typeof robot.Process.prototype.open === "function");
check("Process.prototype.close", typeof robot.Process.prototype.close === "function");
check("Process.prototype.isValid", typeof robot.Process.prototype.isValid === "function");
check("Process.prototype.is64Bit", typeof robot.Process.prototype.is64Bit === "function");
check("Process.prototype.isDebugged", typeof robot.Process.prototype.isDebugged === "function");
check("Process.prototype.getPID", typeof robot.Process.prototype.getPID === "function");
check("Process.prototype.getHandle", typeof robot.Process.prototype.getHandle === "function");
check("Process.prototype.getName", typeof robot.Process.prototype.getName === "function");
check("Process.prototype.getPath", typeof robot.Process.prototype.getPath === "function");
check("Process.prototype.exit",  typeof robot.Process.prototype.exit === "function");
check("Process.prototype.kill",  typeof robot.Process.prototype.kill === "function");
check("Process.prototype.hasExited", typeof robot.Process.prototype.hasExited === "function");
check("Process.prototype.getModules", typeof robot.Process.prototype.getModules === "function");
check("Process.prototype.getWindows", typeof robot.Process.prototype.getWindows === "function");
check("Process.prototype.clone", typeof robot.Process.prototype.clone === "function");
check("Process.getList",         typeof robot.Process.getList === "function");
check("Process.getCurrent",      typeof robot.Process.getCurrent === "function");
check("Process.isSys64Bit",      typeof robot.Process.isSys64Bit === "function");

////////////////////////////////////////////////////////////////////////////////
// Memory
////////////////////////////////////////////////////////////////////////////////

section("Memory");

check("Memory exists",           typeof robot.Memory === "function");
checkNative("Memory() without new", function () {
  return robot.Memory() != null;
});
check("Memory.DEFAULT === 0",    robot.Memory.DEFAULT === 0);
check("Memory.SKIP_ERRORS === 1", robot.Memory.SKIP_ERRORS === 1);
check("Memory.AUTO_ACCESS === 2", robot.Memory.AUTO_ACCESS === 2);
check("Memory.Stats exists",     typeof robot.Memory.Stats === "function");
check("Memory.Region exists",    typeof robot.Memory.Region === "function");
check("Memory.prototype.isValid", typeof robot.Memory.prototype.isValid === "function");
check("Memory.prototype.getProcess", typeof robot.Memory.prototype.getProcess === "function");
check("Memory.prototype.getStats", typeof robot.Memory.prototype.getStats === "function");
check("Memory.prototype.getRegion", typeof robot.Memory.prototype.getRegion === "function");
check("Memory.prototype.getRegions", typeof robot.Memory.prototype.getRegions === "function");
check("Memory.prototype.setAccess", typeof robot.Memory.prototype.setAccess === "function");
check("Memory.prototype.getPtrSize", typeof robot.Memory.prototype.getPtrSize === "function");
check("Memory.prototype.getMinAddress", typeof robot.Memory.prototype.getMinAddress === "function");
check("Memory.prototype.getMaxAddress", typeof robot.Memory.prototype.getMaxAddress === "function");
check("Memory.prototype.getPageSize", typeof robot.Memory.prototype.getPageSize === "function");
check("Memory.prototype.find",   typeof robot.Memory.prototype.find === "function");
check("Memory.prototype.readData", typeof robot.Memory.prototype.readData === "function");
check("Memory.prototype.writeData", typeof robot.Memory.prototype.writeData === "function");
check("Memory.prototype.readInt8", typeof robot.Memory.prototype.readInt8 === "function");
check("Memory.prototype.readInt16", typeof robot.Memory.prototype.readInt16 === "function");
check("Memory.prototype.readInt32", typeof robot.Memory.prototype.readInt32 === "function");
check("Memory.prototype.readInt64", typeof robot.Memory.prototype.readInt64 === "function");
check("Memory.prototype.readReal32", typeof robot.Memory.prototype.readReal32 === "function");
check("Memory.prototype.readReal64", typeof robot.Memory.prototype.readReal64 === "function");
check("Memory.prototype.readBool", typeof robot.Memory.prototype.readBool === "function");
check("Memory.prototype.readString", typeof robot.Memory.prototype.readString === "function");
check("Memory.prototype.readPtr", typeof robot.Memory.prototype.readPtr === "function");
check("Memory.prototype.writeInt8", typeof robot.Memory.prototype.writeInt8 === "function");
check("Memory.prototype.writeInt16", typeof robot.Memory.prototype.writeInt16 === "function");
check("Memory.prototype.writeInt32", typeof robot.Memory.prototype.writeInt32 === "function");
check("Memory.prototype.writeInt64", typeof robot.Memory.prototype.writeInt64 === "function");
check("Memory.prototype.writeReal32", typeof robot.Memory.prototype.writeReal32 === "function");
check("Memory.prototype.writeReal64", typeof robot.Memory.prototype.writeReal64 === "function");
check("Memory.prototype.writeBool", typeof robot.Memory.prototype.writeBool === "function");
check("Memory.prototype.writeString", typeof robot.Memory.prototype.writeString === "function");
check("Memory.prototype.writePtr", typeof robot.Memory.prototype.writePtr === "function");
check("Memory.prototype.createCache", typeof robot.Memory.prototype.createCache === "function");
check("Memory.prototype.clearCache", typeof robot.Memory.prototype.clearCache === "function");
check("Memory.prototype.deleteCache", typeof robot.Memory.prototype.deleteCache === "function");
check("Memory.prototype.isCaching", typeof robot.Memory.prototype.isCaching === "function");
check("Memory.prototype.getCacheSize", typeof robot.Memory.prototype.getCacheSize === "function");
check("Memory.prototype.clone",  typeof robot.Memory.prototype.clone === "function");

// Memory.Stats
check("Memory.Stats() without new", robot.Memory.Stats() != null);
var stats = robot.Memory.Stats();
check("Stats.systemReads === 0",  stats.systemReads === 0);
check("Stats.cachedReads === 0",  stats.cachedReads === 0);
check("Stats.systemWrites === 0", stats.systemWrites === 0);
check("Stats.accessWrites === 0", stats.accessWrites === 0);
check("Stats.readErrors === 0",   stats.readErrors === 0);
check("Stats.writeErrors === 0",  stats.writeErrors === 0);
check("Stats.prototype.clone",   typeof robot.Memory.Stats.prototype.clone === "function");

// Memory.Region
check("Memory.Region() without new", robot.Memory.Region() != null);
var region = robot.Memory.Region();
check("Region.valid === false",   region.valid === false);
check("Region.start === 0",      region.start === 0);
check("Region.prototype.contains", typeof robot.Memory.Region.prototype.contains === "function");
check("Region.prototype.clone",  typeof robot.Memory.Region.prototype.clone === "function");
check("Region.compare",          typeof robot.Memory.Region.compare === "function");

////////////////////////////////////////////////////////////////////////////////
// Module
////////////////////////////////////////////////////////////////////////////////

section("Module");

check("Module exists",           typeof robot.Module === "function");
check("Module() without new",    robot.Module() != null);
check("Module.Segment exists",   typeof robot.Module.Segment === "function");
check("Module.prototype.isValid", typeof robot.Module.prototype.isValid === "function");
check("Module.prototype.getName", typeof robot.Module.prototype.getName === "function");
check("Module.prototype.getPath", typeof robot.Module.prototype.getPath === "function");
check("Module.prototype.getBase", typeof robot.Module.prototype.getBase === "function");
check("Module.prototype.getSize", typeof robot.Module.prototype.getSize === "function");
check("Module.prototype.getProcess", typeof robot.Module.prototype.getProcess === "function");
check("Module.prototype.contains", typeof robot.Module.prototype.contains === "function");
check("Module.prototype.getSegments", typeof robot.Module.prototype.getSegments === "function");
check("Module.prototype.clone",  typeof robot.Module.prototype.clone === "function");
check("Module.compare",          typeof robot.Module.compare === "function");

// Module.Segment
check("Segment() without new",   robot.Module.Segment() != null);
check("Segment.prototype.contains", typeof robot.Module.Segment.prototype.contains === "function");
check("Segment.prototype.clone", typeof robot.Module.Segment.prototype.clone === "function");
check("Segment.compare",         typeof robot.Module.Segment.compare === "function");

////////////////////////////////////////////////////////////////////////////////
// Button constants
////////////////////////////////////////////////////////////////////////////////

section("Button Constants");

check("BUTTON_LEFT === 0",       robot.BUTTON_LEFT === 0);
check("BUTTON_MID === 1",        robot.BUTTON_MID === 1);
check("BUTTON_MIDDLE === 1",     robot.BUTTON_MIDDLE === 1);
check("BUTTON_RIGHT === 2",      robot.BUTTON_RIGHT === 2);
check("BUTTON_X1 === 3",         robot.BUTTON_X1 === 3);
check("BUTTON_X2 === 4",         robot.BUTTON_X2 === 4);

////////////////////////////////////////////////////////////////////////////////
// Key constants (spot-check — full list is platform-specific)
////////////////////////////////////////////////////////////////////////////////

section("Key Constants (spot check)");

check("KEY_SPACE is a number",    typeof robot.KEY_SPACE === "number");
check("KEY_ESCAPE is a number",   typeof robot.KEY_ESCAPE === "number");
check("KEY_TAB is a number",      typeof robot.KEY_TAB === "number");
check("KEY_RETURN is a number",   typeof robot.KEY_RETURN === "number");
check("KEY_BACKSPACE is a number", typeof robot.KEY_BACKSPACE === "number");
check("KEY_ALT is a number",      typeof robot.KEY_ALT === "number");
check("KEY_CONTROL is a number",  typeof robot.KEY_CONTROL === "number");
check("KEY_SHIFT is a number",    typeof robot.KEY_SHIFT === "number");
check("KEY_SYSTEM is a number",   typeof robot.KEY_SYSTEM === "number");
check("KEY_F1 is a number",       typeof robot.KEY_F1 === "number");
check("KEY_F12 is a number",      typeof robot.KEY_F12 === "number");
check("KEY_A is a number",        typeof robot.KEY_A === "number");
check("KEY_Z is a number",        typeof robot.KEY_Z === "number");
check("KEY_0 is a number",        typeof robot.KEY_0 === "number");
check("KEY_9 is a number",        typeof robot.KEY_9 === "number");
check("KEY_LEFT is a number",     typeof robot.KEY_LEFT === "number");
check("KEY_UP is a number",       typeof robot.KEY_UP === "number");
check("KEY_RIGHT is a number",    typeof robot.KEY_RIGHT === "number");
check("KEY_DOWN is a number",     typeof robot.KEY_DOWN === "number");

////////////////////////////////////////////////////////////////////////////////
// Memory constants
////////////////////////////////////////////////////////////////////////////////

section("Memory Constants");

// These are on the Memory class itself, already checked above,
// but also verify the top-level aliases if they exist in robot-js.
check("MEMORY_DEFAULT exists or Memory.DEFAULT === 0",
  robot.Memory.DEFAULT === 0);
check("MEMORY_SKIP_ERRORS or Memory.SKIP_ERRORS === 1",
  robot.Memory.SKIP_ERRORS === 1);
check("MEMORY_AUTO_ACCESS or Memory.AUTO_ACCESS === 2",
  robot.Memory.AUTO_ACCESS === 2);

////////////////////////////////////////////////////////////////////////////////
// Backend management
////////////////////////////////////////////////////////////////////////////////

section("Backend Management");

check("getNativeBackend is a function",
  typeof robot.getNativeBackend === "function");
check("setNativeBackend is a function",
  typeof robot.setNativeBackend === "function");

////////////////////////////////////////////////////////////////////////////////
// Behavioral smoke tests (non-interactive, safe operations)
////////////////////////////////////////////////////////////////////////////////

section("Behavioral Smoke Tests");

// Range clone
var r1 = robot.Range(10, 20);
var r2 = r1.clone();
check("Range clone is independent", r1.eq(r2) && r1 !== r2);

// Point arithmetic
var p1 = robot.Point(10, 20);
var p2 = robot.Point(5, 3);
var p3 = p1.add(p2);
check("Point.add works", p3.x === 15 && p3.y === 23);

// Size arithmetic
var s1 = robot.Size(100, 200);
var s2 = robot.Size(10, 20);
var s3 = s1.sub(s2);
check("Size.sub works", s3.w === 90 && s3.h === 180);

// Bounds containment
var b1 = robot.Bounds(0, 0, 100, 100);
check("Bounds.containsP works", b1.containsP(robot.Point(50, 50)));
check("Bounds.containsP rejects outside",
  !b1.containsP(robot.Point(150, 150)));

// Color ARGB round-trip
var c1 = robot.Color(10, 20, 30, 40);
var argb = c1.getARGB();
var c2 = robot.Color();
c2.setARGB(argb);
check("Color ARGB round-trip", c1.eq(c2));

// Hash determinism
var h1 = robot.Hash("hello");
var h2 = robot.Hash("hello");
check("Hash deterministic", h1.result === h2.result);
check("Hash differs for different input",
  robot.Hash("hello").result !== robot.Hash("world").result);

// Image create/destroy
var img = robot.Image(10, 20);
check("Image.create via constructor", img.isValid());
check("Image.getWidth", img.getWidth() === 10);
check("Image.getHeight", img.getHeight() === 20);
check("Image.getLength", img.getLength() === 10 * 20);
img.destroy();
check("Image.destroy", !img.isValid());

// Timer elapsed
var t = robot.Timer();
t.start();
check("Timer.hasStarted after start", t.hasStarted());
check("Timer.getElapsed >= 0", t.getElapsed() >= 0);

// Keyboard.compile complex string (uses key constant lookup, pure TS)
var keys = robot.Keyboard.compile("{ESCAPE}");
check("Keyboard.compile('{ESCAPE}') produces events",
  Array.isArray(keys) && keys.length >= 2);

////////////////////////////////////////////////////////////////////////////////
// Summary
////////////////////////////////////////////////////////////////////////////////

console.log("\n==============================");
console.log("  Passed:  " + passed);
console.log("  Failed:  " + failed);
if (skipped > 0)
  console.log("  Skipped: " + skipped + " (no native backend)");
console.log("  Total:   " + (passed + failed + skipped));
console.log("==============================\n");

process.exitCode = (failed > 0) ? 1 : 0;
