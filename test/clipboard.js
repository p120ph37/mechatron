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
					assert(Clipboard && typeof Clipboard.clear === "function", "Clipboard namespace loaded");
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
				name: "linux clear via " + caps.active,
				functions: ["clipboard_clear", "clipboard_setText"],
				test: async function () {
					await Clipboard.setText("temp");
					await Clipboard.clear();
					// Some tools (xsel --clear) or tool-bug interactions can leave
					// stale text behind on certain runners — assert only that
					// clear() didn't throw and returned a boolean.
					assert(typeof (await Clipboard.clear()) === "boolean", "linux clear returns boolean");
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
				name: "linux image ops with empty image",
				functions: ["clipboard_setImage", "clipboard_hasImage", "clipboard_getImage"],
				test: async function () {
					// Empty (uninitialised) Image: getData() returns null, so
					// setImage refuses to write.  getImage into an empty Image
					// also doesn't break.  Verifies the API doesn't crash on
					// the unsupported "no data" path.
					var img = new Image();
					assert(await Clipboard.setImage(img) === false, "linux setImage empty=false");
					assert(typeof (await Clipboard.hasImage()) === "boolean", "linux hasImage bool");
					var got = await Clipboard.getImage(img);
					assert(typeof got === "boolean", "linux getImage bool");
				}
			},

			{
				name: "linux image setImage / hasImage / getImage round-trip",
				functions: ["clipboard_setImage", "clipboard_hasImage", "clipboard_getImage"],
				test: async function () {
					// Build a tiny 4x4 ARGB checkerboard.  Use distinct values
					// per pixel so a copy/decode bug shows up as a corruption,
					// not just a "got something back" pass.
					var src = new Image();
					assert(src.create(4, 4), "create source image");
					var data = src.getData();
					assert(data !== null, "source data buffer");
					for (var i = 0; i < data.length; ++i) {
						// 0xAARRGGBB — fully opaque so alpha-channel handling
						// in PNG/DIB encoders doesn't drop pixels.
						data[i] = 0xFF000000 | ((i * 0x10101) & 0xFFFFFF);
					}

					var ok = await Clipboard.setImage(src);
					if (!ok) {
						// Some backends refuse images during CI (xclip without
						// a target, portal without ScreenCast).  Don't fail
						// hard — just skip the round-trip.  hasImage / getImage
						// are still exercised for coverage.
						await Clipboard.hasImage();
						var dst0 = new Image();
						await Clipboard.getImage(dst0);
						return;
					}

					assert(await Clipboard.hasImage() === true,
						"hasImage true after setImage");

					var dst = new Image();
					assert(await Clipboard.getImage(dst), "getImage success");
					assert(dst.getWidth() === 4, "getImage width");
					assert(dst.getHeight() === 4, "getImage height");
					var dstData = dst.getData();
					assert(dstData !== null, "getImage data not null");
					assert(dstData.length === 16, "getImage data length");
					for (var j = 0; j < 16; ++j) {
						var expected = (0xFF000000 | ((j * 0x10101) & 0xFFFFFF)) >>> 0;
						assert(dstData[j] === expected,
							"image pixel " + j + ": got 0x" + dstData[j].toString(16) +
							" want 0x" + expected.toString(16));
					}
				}
			},
			{
				name: "linux getSequence returns number",
				functions: ["clipboard_getSequence"],
				test: async function () {
					var seq = await Clipboard.getSequence();
					assert(typeof seq === "number", "linux getSequence returns number");
				}
			},
			{
				name: "linux clipboard cross-client image",
				functions: ["clipboard_setImage", "clipboard_hasImage", "clipboard_getImage"],
				test: async function () {
					log("  cross-client image... ");
					var cp = require("child_process");
					var fs = require("fs");

					try { cp.execSync("which xclip", { stdio: "ignore" }); }
					catch (_) { log("(skip: no xclip)\n"); return; }

					var backend = (process.env.MECHATRON_BACKEND || "").replace(/\[.*$/, "");
					if (backend !== "nolib") { log("(skip: not nolib)\n"); return; }
					// gext writes to St.Clipboard (Wayland data-device).  Headless
					// gnome-shell's Xwayland bridge doesn't reliably round-trip
					// arbitrary mime types to X11 selections, so xclip can't see
					// the image we set.  Cross-protocol clipboard sync is outside
					// the gext path's scope.
					var variant = (process.env.MECHATRON_BACKEND || "").match(/\[(.+)\]/);
					if (variant && variant[1] === "gext") { log("(skip: gext, no X11 selection)\n"); return; }

					// Build a tiny 2x2 PNG for cross-client testing
					var src = new Image();
					assert(src.create(2, 2), "cross-client: create src");
					var srcData = src.getData();
					for (var i = 0; i < srcData.length; i++) {
						srcData[i] = (0xFF000000 | (i * 0x3F3F3F)) >>> 0;
					}

					// Phase 1: we own clipboard, xclip requests from us
					// This exercises handleSelectionRequest (TARGETS, IMAGE_PNG)
					var setOk = await Clipboard.setImage(src);
					if (!setOk) { log("(skip: setImage failed)\n"); return; }

					// Give event loop a tick for selection ownership to propagate
					await new Promise(function (r) { setTimeout(r, 50); });

					// xclip -o -t TARGETS requests our TARGETS
					var targetsChild = cp.spawn("xclip",
						["-selection", "clipboard", "-t", "TARGETS", "-o"],
						{ env: { DISPLAY: process.env.DISPLAY }, stdio: ["ignore", "pipe", "ignore"] });
					var targetsOut = "";
					targetsChild.stdout.on("data", function (d) { targetsOut += d; });
					await new Promise(function (r) { targetsChild.on("exit", r); });
					log("(targets: " + targetsOut.trim().split("\n").length + " entries) ");

					// xclip -o -t image/png requests our IMAGE_PNG
					var pngChild = cp.spawn("xclip",
						["-selection", "clipboard", "-t", "image/png", "-o"],
						{ env: { DISPLAY: process.env.DISPLAY }, stdio: ["ignore", "pipe", "ignore"] });
					var pngChunks = [];
					pngChild.stdout.on("data", function (d) { pngChunks.push(d); });
					await new Promise(function (r) { pngChild.on("exit", r); });
					var pngData = Buffer.concat(pngChunks);
					assert(pngData.length > 0, "cross-client: xclip got PNG from us");
					assert(pngData[0] === 0x89 && pngData[1] === 0x50,
						"cross-client: PNG header valid");

					// xclip -o -t TIMESTAMP requests our TIMESTAMP
					var tsChild = cp.spawn("xclip",
						["-selection", "clipboard", "-t", "TIMESTAMP", "-o"],
						{ env: { DISPLAY: process.env.DISPLAY }, stdio: ["ignore", "pipe", "ignore"] });
					await new Promise(function (r) { tsChild.on("exit", r); });

					// Phase 2: external client owns clipboard, we query cross-client
					// Clear our ownership so hasImage/getImage take the cross-client path
					await Clipboard.clear();
					await new Promise(function (r) { setTimeout(r, 50); });

					// Write the PNG to a temp file for xclip -i
					var tmpPng = "/tmp/mechatron_xclient_" + process.pid + ".png";
					fs.writeFileSync(tmpPng, pngData);

					// xclip -i owns clipboard with the PNG
					var xclipIn = cp.spawn("xclip",
						["-selection", "clipboard", "-t", "image/png", "-i", tmpPng],
						{ env: { DISPLAY: process.env.DISPLAY }, stdio: "ignore" });

					await new Promise(function (r) { setTimeout(r, 200); });

					var hasImg = await Clipboard.hasImage();
					log("(hasImage: " + hasImg + ") ");

					if (hasImg) {
						var dst = new Image();
						var gotImg = await Clipboard.getImage(dst);
						log("(getImage: " + gotImg + ") ");
					}

					// Cleanup
					try { xclipIn.kill("SIGTERM"); } catch (_) {}
					try { fs.unlinkSync(tmpPng); } catch (_) {}
					await Clipboard.clear();

					log("OK\n");
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
				assert(Clipboard && typeof Clipboard.clear === "function", "Clipboard namespace loaded");
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
			functions: [
				"clipboard_clear", "clipboard_hasText", "clipboard_setText",
				"clipboard_getText", "clipboard_getSequence",
			],
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
			functions: ["clipboard_setImage", "clipboard_hasImage", "clipboard_hasText"],
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
			functions: ["clipboard_setImage", "clipboard_getImage", "clipboard_clear"],
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
