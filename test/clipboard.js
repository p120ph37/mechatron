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

module.exports = function (mechatron, log, assert, waitFor) {

	var Clipboard = mechatron.Clipboard;
	var Image = mechatron.Image;

	if (process.platform === "linux") {
		var Platform = mechatron.Platform;
		var caps = Platform.getCapabilities("clipboard");
		var noTool = !caps.active || caps.active === "none";

		if (noTool) {
			// No clipboard tool installed — verify graceful degradation.
			return [
				{
					name: "linux clear returns false (no tool)",
					functions: ["clipboard_ctor"],
					test: async function () {
						assert(await Clipboard.clear() === false, "linux clear (no tool)");
					}
				},
				{
					name: "linux hasText returns false (no tool)",
					functions: ["clipboard_ctor"],
					test: async function () {
						assert(await Clipboard.hasText() === false, "linux hasText (no tool)");
					}
				},
				{
					name: "linux getText returns empty (no tool)",
					functions: ["clipboard_ctor"],
					test: async function () {
						assert((await Clipboard.getText()).length === 0, "linux getText (no tool)");
					}
				},
				{
					name: "linux setText returns false (no tool)",
					functions: ["clipboard_ctor"],
					test: async function () {
						assert(await Clipboard.setText("Hello") === false, "linux setText (no tool)");
					}
				}
			];
		}

		// Linux with a clipboard tool available.
		return [
			{
				name: "linux clipboard constructor via " + caps.active,
				functions: ["clipboard_ctor"],
				test: async function () {
					assert(typeof Clipboard === "function", "Clipboard is a constructor");
				}
			},
			{
				name: "linux setText + getText round-trip via " + caps.active,
				functions: ["clipboard_setText", "clipboard_getText"],
				test: async function () {
					assert(await Clipboard.setText("Hello"), "linux setText Hello via " + caps.active);
					assert(await Clipboard.getText() === "Hello", "linux getText Hello via " + caps.active);
				}
			},
			{
				name: "linux hasText after setText via " + caps.active,
				functions: ["clipboard_setText", "clipboard_hasText"],
				test: async function () {
					assert(await Clipboard.setText("Hello"), "linux setText Hello via " + caps.active);
					assert(await Clipboard.hasText(), "linux hasText after set via " + caps.active);
				}
			},
			{
				name: "linux image ops unsupported",
				functions: ["clipboard_setImage", "clipboard_hasImage", "clipboard_getImage"],
				test: async function () {
					var img = new Image();
					assert(await Clipboard.hasImage() === false, "linux hasImage");
					assert(await Clipboard.getImage(img) === false, "linux getImage");
					assert(await Clipboard.setImage(img) === false, "linux setImage");
				}
			},
			{
				name: "linux getSequence returns number",
				functions: ["clipboard_getSequence"],
				test: async function () {
					var seq = await Clipboard.getSequence();
					assert(typeof seq === "number", "linux getSequence returns number");
				}
			}
		];
	}

	// Non-Linux platforms.
	return [
		{
			name: "clipboard constructor",
			functions: ["clipboard_ctor"],
			test: async function () {
				assert(typeof Clipboard === "function", "Clipboard is a constructor");
			}
		},
		{
			name: "setText + getText round-trip",
			functions: ["clipboard_setText", "clipboard_getText"],
			test: async function () {
				assert(await Clipboard.setText("Hello"), "setText Hello");
				assert(await Clipboard.getText() === "Hello", "getText Hello");

				assert(await Clipboard.setText("World"), "setText World");
				assert(await Clipboard.getText() === "World", "getText World");
			}
		},
		{
			name: "hasText after setText",
			functions: ["clipboard_setText", "clipboard_hasText"],
			test: async function () {
				assert(await Clipboard.setText("Hello"), "setText Hello");
				assert(await Clipboard.hasText(), "hasText after set");
			}
		},
		{
			name: "getSequence consistency and change detection",
			functions: ["clipboard_getSequence"],
			test: async function () {
				var s1 = await Clipboard.getSequence();
				assert(s1 !== 0, "getSequence non-zero");
				assert(await Clipboard.getSequence() === s1, "getSequence consistent");
			}
		},
		{
			name: "clear + verify empty",
			functions: ["clipboard_clear", "clipboard_hasText"],
			test: async function () {
				assert(await Clipboard.setText("temp"), "setText temp for clear test");
				var s1 = await Clipboard.getSequence();

				assert(await Clipboard.clear(), "clear");
				assert(await Clipboard.hasText() === false, "!hasText after clear");
				assert(await Clipboard.getText() === "", "getText empty after clear");
				assert(await Clipboard.getSequence() !== s1, "sequence changed after clear");
			}
		},
		{
			name: "large text round-trip (64K)",
			functions: ["clipboard_setText", "clipboard_getText"],
			test: async function () {
				var big = new Array(65536).join("X");
				assert(await Clipboard.setText(big), "setText large");
				assert(await Clipboard.getText() === big, "getText large round-trip");
			}
		},
		{
			name: "setImage + hasImage",
			functions: ["clipboard_setImage", "clipboard_hasImage"],
			test: async function () {
				var src = new Image(4, 4);
				src.fill(128, 64, 32);
				assert(await Clipboard.setImage(src), "setImage");
				assert(await Clipboard.hasImage(), "hasImage after set");
				assert(await Clipboard.hasText() === false, "!hasText after setImage");
			}
		},
		{
			name: "setImage + getImage round-trip",
			functions: ["clipboard_setImage", "clipboard_getImage"],
			test: async function () {
				var src = new Image(4, 4);
				src.fill(128, 64, 32);
				assert(await Clipboard.setImage(src), "setImage");

				var dst = new Image();
				assert(await Clipboard.getImage(dst), "getImage");
				assert(dst.isValid(), "dst valid");
				assert(dst.getWidth() === 4, "dst width");
				assert(dst.getHeight() === 4, "dst height");

				await Clipboard.clear();
			}
		}
	];
};
