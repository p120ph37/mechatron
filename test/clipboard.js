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

	async function testClipboard() {
		log("  Clipboard... ");

		var Clipboard = mechatron.Clipboard;
		var Image = mechatron.Image;

		if (process.platform === "linux") {
			// Linux clipboard is mechanism-dependent (wl-clipboard / xclip /
			// xsel — see PLAN.md §6b).  Test both the "no tools installed"
			// path and (if a tool *is* available) a basic round-trip.
			var Platform = mechatron.Platform;
			var caps = Platform.getCapabilities("clipboard");
			var img = new Image();

			if (!caps.active || caps.active === "none") {
				assert(await Clipboard.clear() === false, "linux clear (no tool)");
				assert(await Clipboard.hasText() === false, "linux hasText (no tool)");
				assert((await Clipboard.getText()).length === 0, "linux getText (no tool)");
				assert(await Clipboard.setText("Hello") === false, "linux setText (no tool)");
				log("OK (linux - no clipboard tool installed)\n");
				return true;
			}

			assert(await Clipboard.setText("Hello"), "linux setText Hello via " + caps.active);
			assert(await Clipboard.hasText(), "linux hasText after set via " + caps.active);
			assert(await Clipboard.getText() === "Hello", "linux getText Hello via " + caps.active);

			assert(await Clipboard.hasImage() === false, "linux hasImage");
			assert(await Clipboard.getImage(img) === false, "linux getImage");
			assert(await Clipboard.setImage(img) === false, "linux setImage");

			var seq = await Clipboard.getSequence();
			assert(typeof seq === "number", "linux getSequence returns number");

			log("OK (linux - " + caps.active + ")\n");
			return true;
		}

		assert(await Clipboard.setText("Hello"), "setText Hello");
		assert(await Clipboard.hasText(), "hasText after set");
		assert(await Clipboard.getText() === "Hello", "getText Hello");

		assert(await Clipboard.setText("World"), "setText World");
		assert(await Clipboard.getText() === "World", "getText World");

		var s1 = await Clipboard.getSequence();
		assert(s1 !== 0, "getSequence non-zero");
		assert(await Clipboard.getSequence() === s1, "getSequence consistent");

		assert(await Clipboard.clear(), "clear");
		assert(await Clipboard.hasText() === false, "!hasText after clear");
		assert(await Clipboard.getText() === "", "getText empty after clear");
		assert(await Clipboard.getSequence() !== s1, "sequence changed after clear");

		var big = new Array(65536).join("X");
		assert(await Clipboard.setText(big), "setText large");
		assert(await Clipboard.getText() === big, "getText large round-trip");

		var src = new Image(4, 4);
		src.fill(128, 64, 32);
		assert(await Clipboard.setImage(src), "setImage");
		assert(await Clipboard.hasImage(), "hasImage after set");
		assert(await Clipboard.hasText() === false, "!hasText after setImage");

		var dst = new Image();
		assert(await Clipboard.getImage(dst), "getImage");
		assert(dst.isValid(), "dst valid");
		assert(dst.getWidth() === 4, "dst width");
		assert(dst.getHeight() === 4, "dst height");

		await Clipboard.clear();

		log("OK\n");
		return true;
	}

	return {
		testClipboard: testClipboard,
	};
};
