////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Clipboard Test Module                          //
//                                                                            //
//  Exercises Clipboard class using the modern mechatron API.                 //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip) {

	function testClipboard() {
		log("  Clipboard... ");

		var Clipboard = mechatron.Clipboard;
		var Image = mechatron.Image;

		if (process.platform === "linux") {
			// Linux X11 clipboard without a clipboard manager
			assert(Clipboard.clear() === false, "linux clear");
			assert(Clipboard.hasText() === false, "linux hasText");
			assert(Clipboard.getText().length === 0, "linux getText");
			assert(Clipboard.setText("Hello") === false, "linux setText");

			var img = new Image();
			assert(Clipboard.hasImage() === false, "linux hasImage");
			assert(Clipboard.getImage(img) === false, "linux getImage");
			assert(Clipboard.setImage(img) === false, "linux setImage");

			assert(Clipboard.getSequence() === 0, "linux getSequence");

			log("OK (linux - no clipboard manager)\n");
			return true;
		}

		// --- Mac / Windows: full clipboard testing ---
		// Text round-trip
		assert(Clipboard.setText("Hello"), "setText Hello");
		assert(Clipboard.hasText(), "hasText after set");
		assert(Clipboard.getText() === "Hello", "getText Hello");

		assert(Clipboard.setText("World"), "setText World");
		assert(Clipboard.getText() === "World", "getText World");

		// Sequence tracking
		var s1 = Clipboard.getSequence();
		assert(s1 !== 0, "getSequence non-zero");
		assert(Clipboard.getSequence() === s1, "getSequence consistent");

		// Clear
		assert(Clipboard.clear(), "clear");
		assert(Clipboard.hasText() === false, "!hasText after clear");
		assert(Clipboard.getText() === "", "getText empty after clear");
		assert(Clipboard.getSequence() !== s1, "sequence changed after clear");

		// Large text
		var big = new Array(65536).join("X");
		assert(Clipboard.setText(big), "setText large");
		assert(Clipboard.getText() === big, "getText large round-trip");

		// Image round-trip
		var src = new Image(4, 4);
		src.fill(128, 64, 32);
		assert(Clipboard.setImage(src), "setImage");
		assert(Clipboard.hasImage(), "hasImage after set");
		assert(Clipboard.hasText() === false, "!hasText after setImage");

		var dst = new Image();
		assert(Clipboard.getImage(dst), "getImage");
		assert(dst.isValid(), "dst valid");
		assert(dst.getWidth() === 4, "dst width");
		assert(dst.getHeight() === 4, "dst height");

		// Cleanup
		Clipboard.clear();

		log("OK\n");
		return true;
	}

	function testClipboardAsync() {
		log("  Clipboard (async)... ");

		var Clipboard = mechatron.Clipboard;

		var p1 = Clipboard.getTextAsync();
		assert(p1 instanceof Promise, "getTextAsync returns Promise");
		var p2 = Clipboard.setTextAsync("async-test");
		assert(p2 instanceof Promise, "setTextAsync returns Promise");
		var p3 = Clipboard.getImageAsync(new mechatron.Image());
		assert(p3 instanceof Promise, "getImageAsync returns Promise");
		var p4 = Clipboard.setImageAsync(new mechatron.Image());
		assert(p4 instanceof Promise, "setImageAsync returns Promise");

		log("OK\n");
		return true;
	}

	return {
		testClipboard: testClipboard,
		testClipboardAsync: testClipboardAsync,
	};
};
