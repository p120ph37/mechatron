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

		log("OK\n");
		return true;
	}

	function testScreenAsync() {
		log("  Screen (async)... ");

		var Screen = mechatron.Screen;

		var p1 = Screen.synchronizeAsync();
		assert(p1 instanceof Promise, "synchronizeAsync returns Promise");
		var p2 = Screen.grabScreenAsync(new mechatron.Image(), 0, 0, 10, 10);
		assert(p2 instanceof Promise, "grabScreenAsync returns Promise");

		log("OK\n");
		return true;
	}

	return {
		testScreen: testScreen,
		testScreenAsync: testScreenAsync,
	};
};
