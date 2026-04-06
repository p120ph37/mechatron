////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Window Test Module                             //
//                                                                            //
//  Exercises Window class using the modern mechatron API.                    //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip) {

	function testWindow() {
		log("  Window... ");

		var Window = mechatron.Window;
		var Bounds = mechatron.Bounds;
		var Point  = mechatron.Point;

		// --- Invalid window ---
		var w1 = new Window();
		var w2 = new Window();
		assert(!w1.isValid(), "empty invalid");
		assert(w1.getHandle() === 0, "empty handle=0");
		assert(w1.getTitle() === "", "empty title empty");
		assert(w1.getPID() === 0, "empty pid=0");

		assert(w1.setHandle(0), "setHandle 0");
		assert(!w1.setHandle(8888), "setHandle 8888 fails");

		assert(!w1.isTopMost(), "empty !topmost");
		assert(!w1.isBorderless(), "empty !borderless");
		assert(!w1.isMinimized(), "empty !minimized");
		assert(!w1.isMaximized(), "empty !maximized");

		var b = w1.getBounds();
		assert(b instanceof Bounds, "getBounds returns Bounds");
		assert(b.eq(0), "empty bounds eq 0");

		var c = w1.getClient();
		assert(c instanceof Bounds, "getClient returns Bounds");

		var mp = w1.mapToClient(20, 20);
		assert(mp instanceof Point, "mapToClient returns Point");
		var ms = w1.mapToScreen(20, 20);
		assert(ms instanceof Point, "mapToScreen returns Point");

		// Equality
		assert(w1.eq(w2), "empty eq empty");
		assert(!w1.ne(w2), "empty !ne empty");
		assert(w1.eq(0), "empty eq 0");
		assert(w1.ne(8888), "empty ne 8888");

		// --- getList ---
		var list = Window.getList();
		assert(list instanceof Array, "getList is array");

		// --- getActive ---
		var active = Window.getActive();
		assert(active instanceof Window, "getActive returns Window");

		// --- isAxEnabled ---
		assert(typeof Window.isAxEnabled() === "boolean", "isAxEnabled bool");

		// --- Async variants ---
		var pa1 = Window.getListAsync();
		assert(pa1 instanceof Promise, "getListAsync returns Promise");

		log("OK\n");
		return true;
	}

	return {
		testWindow: testWindow,
	};
};
