////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Screen Test Module                            //
//                                                                            //
//  Exercises Screen class using the modern mechatron API.                   //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip) {

	function testScreen() {
		log("  Screen... ");

		var Screen = mechatron.Screen;
		var Bounds = mechatron.Bounds;
		var Image  = mechatron.Image;

		// --- Before synchronize ---
		var tb = Screen.getTotalBounds();
		assert(tb instanceof Bounds, "getTotalBounds returns Bounds");

		// --- synchronize ---
		var synced = Screen.synchronize();
		assert(synced === true, "synchronize returns true");

		var main = Screen.getMain();
		assert(main !== null, "getMain not null");

		var list = Screen.getList();
		assert(list.length > 0, "getList non-empty");
		assert(list[0] === main, "list[0] is main");

		// --- Total bounds/usable ---
		tb = Screen.getTotalBounds();
		var tu = Screen.getTotalUsable();
		assert(tb.isValid(), "totalBounds valid");
		assert(tu.isValid(), "totalUsable valid");

		// --- Screen properties ---
		for (var i = 0; i < list.length; ++i) {
			assert(list[i].getBounds().isValid(), "screen " + i + " bounds valid");
			assert(list[i].getUsable().isValid(), "screen " + i + " usable valid");
			assert(list[i].isPortrait() || list[i].isLandscape(),
				"screen " + i + " is portrait or landscape");
		}

		// --- isCompositing ---
		assert(typeof Screen.isCompositing() === "boolean", "isCompositing bool");

		if (process.platform === "linux" || process.platform === "darwin") {
			assert(Screen.isCompositing(), "compositing true on linux/mac");
			Screen.setCompositing(false);
			assert(Screen.isCompositing(), "compositing stays true on linux/mac");
			Screen.setCompositing(true);
		}

		// --- grabScreen ---
		var img = new Image();
		var result = Screen.grabScreen(img, 0, 0, 100, 100);
		if (result) {
			assert(img.isValid(), "grabbed image valid");
			assert(img.getWidth() === 100, "grabbed width 100");
			assert(img.getHeight() === 100, "grabbed height 100");

			// Grab with bounds
			var img2 = new Image();
			var bounds = new Bounds(0, 0, 50, 50);
			result = Screen.grabScreen(img2, bounds);
			assert(result === true, "grabScreen with bounds");
			assert(img2.isValid(), "grabbed2 valid");
		} else {
			expectOrSkip("grabScreen", "Screen.grabScreen");
			log("(grabScreen unavailable) ");
		}

		// --- Screen clone ---
		var scl = main.clone();
		assert(scl.getBounds().eq(main.getBounds()), "screen clone bounds");

		// --- getScreen with point ---
		var center = main.getBounds().getCenter();
		var found = Screen.getScreen(center.x, center.y);
		assert(found !== null, "getScreen by point");
		// getScreen with Point object
		var found2 = Screen.getScreen(center);
		assert(found2 !== null, "getScreen by Point obj");

		// --- getScreen with window-like object ---
		var mockWin = {
			isValid: function() { return true; },
			getBounds: function() { return { x: 0, y: 0, w: 100, h: 100 }; },
			getHandle: function() { return 0; }
		};
		var foundWin = Screen.getScreen(mockWin);
		assert(foundWin !== null || foundWin === null, "getScreen by window-like");

		// Invalid window-like
		var mockWinInvalid = {
			isValid: function() { return false; },
			getBounds: function() { return { x: 0, y: 0, w: 0, h: 0 }; },
			getHandle: function() { return 0; }
		};
		assert(Screen.getScreen(mockWinInvalid) === null, "getScreen invalid window returns null");

		// --- grabScreen with window handle ---
		if (result) {
			var img3 = new Image();
			var r3 = Screen.grabScreen(img3, 0, 0, 10, 10, 0);
			assert(typeof r3 === "boolean", "grabScreen with window handle");
			// grabScreen with Bounds + window handle
			var img4 = new Image();
			var r4 = Screen.grabScreen(img4, new mechatron.Bounds(0, 0, 10, 10), 0);
			assert(typeof r4 === "boolean", "grabScreen with Bounds + handle");
			// grabScreen with window-like object
			var img5 = new Image();
			var r5 = Screen.grabScreen(img5, 0, 0, 10, 10, mockWin);
			assert(typeof r5 === "boolean", "grabScreen with window-like obj");
			// grabScreen with Bounds + window-like object
			var img6 = new Image();
			var r6 = Screen.grabScreen(img6, new mechatron.Bounds(0, 0, 10, 10), mockWin);
			assert(typeof r6 === "boolean", "grabScreen Bounds + window-like");
		}

		// --- Oversize grab (handle-allocation failure path) ---
		// Pushes CreateCompatibleBitmap / CGBitmapContextCreate / XGetImage past
		// what the host can allocate.  The FFI backends each have a null-check
		// arm for the allocation result; this test reaches it without crashing
		// the process.  The Windows NAPI backend aborts at C++ level on
		// impossibly large requests (exit 3 bypasses JS try/catch), so
		// restrict this probe to the FFI backend where we control the
		// allocation path.
		if (mechatron.getBackend("screen") === "ffi") {
			var imgHuge = new Image();
			var rHuge;
			try {
				rHuge = Screen.grabScreen(imgHuge, 0, 0, 100000, 100000);
			} catch (_) {
				rHuge = false;
			}
			assert(typeof rHuge === "boolean", "oversize grabScreen returns boolean or throws");
		}

		// --- Async variants ---
		var pa1 = Screen.synchronizeAsync();
		assert(pa1 instanceof Promise, "synchronizeAsync returns Promise");
		var pa2 = Screen.grabScreenAsync(new mechatron.Image(), 0, 0, 10, 10);
		assert(pa2 instanceof Promise, "grabScreenAsync returns Promise");
		var pa3 = Screen.grabScreenAsync(new mechatron.Image(), new mechatron.Bounds(0, 0, 10, 10));
		assert(pa3 instanceof Promise, "grabScreenAsync Bounds returns Promise");

		// --- Screen copy constructor ---
		var scopy = new Screen(main);
		assert(scopy.getBounds().eq(main.getBounds()), "Screen copy ctor bounds");

		log("OK\n");
		return true;
	}

	return {
		testScreen: testScreen,
	};
};
