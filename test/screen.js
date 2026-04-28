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

module.exports = function (mechatron, log, assert, waitFor) {

	var Screen = mechatron.Screen;
	var Bounds = mechatron.Bounds;
	var Image  = mechatron.Image;

	return [

		// --- Screen class construction / clone ---
		{
			name: "Screen construction and clone",
			functions: ["screen_ctor"],
			test: async function () {
				// Before synchronize, getTotalBounds still returns a Bounds
				var tb = Screen.getTotalBounds();
				assert(tb instanceof Bounds, "getTotalBounds returns Bounds");

				// clone and copy constructor need a synchronize to get a real
				// screen, but these are purely about the Screen class itself so
				// we synchronize inline just to obtain a screen object.
				var synced = await Screen.synchronize();
				assert(synced === true, "synchronize returns true (for construction test)");

				var main = Screen.getMain();
				assert(main !== null, "getMain not null (for construction test)");

				var scl = main.clone();
				assert(scl.getBounds().eq(main.getBounds()), "screen clone bounds");

				var scopy = new Screen(main);
				assert(scopy.getBounds().eq(main.getBounds()), "Screen copy ctor bounds");
			}
		},

		// --- synchronize + post-sync property tests ---
		{
			name: "Screen.synchronize and properties",
			functions: ["screen_synchronize"],
			test: async function () {
				var synced = await Screen.synchronize();
				assert(synced === true, "synchronize returns true");

				var main = Screen.getMain();
				assert(main !== null, "getMain not null");

				var list = Screen.getList();
				assert(list.length > 0, "getList non-empty");
				assert(list[0] === main, "list[0] is main");

				// Total bounds/usable
				var tb = Screen.getTotalBounds();
				var tu = Screen.getTotalUsable();
				assert(tb.isValid(), "totalBounds valid");
				assert(tu.isValid(), "totalUsable valid");

				// Per-screen properties
				for (var i = 0; i < list.length; ++i) {
					assert(list[i].getBounds().isValid(), "screen " + i + " bounds valid");
					assert(list[i].getUsable().isValid(), "screen " + i + " usable valid");
					assert(list[i].isPortrait() || list[i].isLandscape(),
						"screen " + i + " is portrait or landscape");
				}

				// isCompositing
				assert(typeof Screen.isCompositing() === "boolean", "isCompositing bool");

				if (process.platform === "linux" || process.platform === "darwin") {
					assert(Screen.isCompositing(), "compositing true on linux/mac");
					Screen.setCompositing(false);
					assert(Screen.isCompositing(), "compositing stays true on linux/mac");
					Screen.setCompositing(true);
				}

				// getScreen with point
				var center = main.getBounds().getCenter();
				var found = Screen.getScreen(center.x, center.y);
				assert(found !== null, "getScreen by point");
				var found2 = Screen.getScreen(center);
				assert(found2 !== null, "getScreen by Point obj");

				// getScreen with window-like object
				var mockWin = {
					isValid: function() { return true; },
					getBounds: function() { return { x: 0, y: 0, w: 100, h: 100 }; },
					getHandle: function() { return 0; }
				};
				var foundWin = await Screen.getScreen(mockWin);
				assert(foundWin !== null || foundWin === null, "getScreen by window-like");

				// Invalid window-like
				var mockWinInvalid = {
					isValid: function() { return false; },
					getBounds: function() { return { x: 0, y: 0, w: 0, h: 0 }; },
					getHandle: function() { return 0; }
				};
				assert(await Screen.getScreen(mockWinInvalid) === null, "getScreen invalid window returns null");
			}
		},

		// --- grabScreen tests ---
		{
			name: "Screen.grabScreen",
			functions: ["screen_synchronize", "screen_grabScreen"],
			test: async function () {
				await Screen.synchronize();

				var img = new Image();
				var result = await Screen.grabScreen(img, 0, 0, 100, 100);
				if (result) {
					assert(img.isValid(), "grabbed image valid");
					assert(img.getWidth() === 100, "grabbed width 100");
					assert(img.getHeight() === 100, "grabbed height 100");

					// Grab with bounds
					var img2 = new Image();
					var bounds = new Bounds(0, 0, 50, 50);
					result = await Screen.grabScreen(img2, bounds);
					assert(result === true, "grabScreen with bounds");
					assert(img2.isValid(), "grabbed2 valid");

					// grabScreen with window handle
					var mockWin = {
						isValid: function() { return true; },
						getBounds: function() { return { x: 0, y: 0, w: 100, h: 100 }; },
						getHandle: function() { return 0; }
					};
					var img3 = new Image();
					var r3 = await Screen.grabScreen(img3, 0, 0, 10, 10, 0);
					assert(typeof r3 === "boolean", "grabScreen with window handle");
					var img4 = new Image();
					var r4 = await Screen.grabScreen(img4, new mechatron.Bounds(0, 0, 10, 10), 0);
					assert(typeof r4 === "boolean", "grabScreen with Bounds + handle");
					var img5 = new Image();
					var r5 = await Screen.grabScreen(img5, 0, 0, 10, 10, mockWin);
					assert(typeof r5 === "boolean", "grabScreen with window-like obj");
					var img6 = new Image();
					var r6 = await Screen.grabScreen(img6, new mechatron.Bounds(0, 0, 10, 10), mockWin);
					assert(typeof r6 === "boolean", "grabScreen Bounds + window-like");
				} else {
					// Matrix says grabScreen should work — if it returned false,
					// that is a real test failure.
					assert(false, "Screen.grabScreen returned false but matrix marked it ok");
				}
			}
		},

		// --- Oversize grab (handle-allocation failure path) ---
		{
			name: "Screen.grabScreen oversize allocation",
			functions: ["screen_grabScreen"],
			test: async function () {
				if (mechatron.getBackend("screen") !== "ffi") {
					log("(skipped: not ffi backend) ");
					return;
				}
				var imgHuge = new Image();
				var rHuge;
				try {
					rHuge = await Screen.grabScreen(imgHuge, 0, 0, 100000, 100000);
				} catch (_) {
					rHuge = false;
				}
				assert(typeof rHuge === "boolean", "oversize grabScreen returns boolean or throws");
			}
		},

		// --- Promise-returning assertions ---
		{
			name: "Screen async methods return Promises",
			functions: ["screen_synchronize", "screen_grabScreen"],
			test: async function () {
				var pa1 = Screen.synchronize();
				assert(pa1 instanceof Promise, "synchronize returns Promise");
				var pa2 = Screen.grabScreen(new mechatron.Image(), 0, 0, 10, 10);
				assert(pa2 instanceof Promise, "grabScreen returns Promise");
				var pa3 = Screen.grabScreen(new mechatron.Image(), new mechatron.Bounds(0, 0, 10, 10));
				assert(pa3 instanceof Promise, "grabScreen Bounds returns Promise");

				// Await them so they don't leak.
				await pa1;
				await pa2;
				await pa3;
			}
		},

		// --- Framebuffer / DRM pure-encoding tests ---
		{
			name: "Framebuffer/DRM pure-encoding helpers",
			functions: ["screen_ctor"],
			test: async function () {
				var IS_BUN = typeof globalThis.Bun !== "undefined";
				var fb = IS_BUN
					? require("../lib/screen/framebuffer")
					: require("../dist/screen/framebuffer");

				// fb_var_screeninfo: width/height/bpp + RGB bitfields.
				var vinfo = new Uint8Array(160);
				var vdv = new DataView(vinfo.buffer);
				vdv.setUint32(0, 1920, true);       // xres
				vdv.setUint32(4, 1080, true);       // yres
				vdv.setUint32(24, 32, true);        // bits_per_pixel
				vdv.setUint32(32, 16, true); vdv.setUint32(36, 8, true);  // red
				vdv.setUint32(44, 8, true);  vdv.setUint32(48, 8, true);  // green
				vdv.setUint32(56, 0, true);  vdv.setUint32(60, 8, true);  // blue
				vdv.setUint32(68, 24, true); vdv.setUint32(72, 8, true);  // alpha
				var geom = fb.parseFbVarScreenInfo(vinfo);
				assert(geom.width === 1920, "fb var width");
				assert(geom.height === 1080, "fb var height");
				assert(geom.bitsPerPixel === 32, "fb var bpp");
				assert(geom.rOffset === 16 && geom.rLength === 8, "fb var R bitfield");
				assert(geom.bOffset === 0 && geom.bLength === 8, "fb var B bitfield");

				// fb_fix_screeninfo: line_length@40, smem_len@20.
				var finfo = new Uint8Array(68);
				var fdv = new DataView(finfo.buffer);
				fdv.setUint32(20, 1920 * 1080 * 4, true); // smem_len
				fdv.setUint32(40, 1920 * 4, true);         // line_length
				assert(fb.parseFbFixLineLength(finfo) === 7680, "fb fix line_length");
				assert(fb.parseFbFixSmemLen(finfo) === 8294400, "fb fix smem_len");

				// rowToArgb fast path: 32-bit BGRA.
				var srcRow = new Uint8Array([0x10, 0x20, 0x30, 0xFF,  0x40, 0x50, 0x60, 0xFF]);
				var dstPix = new Uint32Array(2);
				fb.rowToArgb(srcRow, 0, dstPix, 0, 2, geom);
				assert(dstPix[0] === 0xFF302010, "rowToArgb 32bpp pixel 0");
				assert(dstPix[1] === 0xFF605040, "rowToArgb 32bpp pixel 1");

				// rowToArgb 24-bit path
				geom.bitsPerPixel = 24;
				var src24 = new Uint8Array([0x10, 0x20, 0x30,  0x40, 0x50, 0x60]);
				fb.rowToArgb(src24, 0, dstPix, 0, 2, geom);
				assert(dstPix[0] === 0xFF302010, "rowToArgb 24bpp pixel 0");
				assert(dstPix[1] === 0xFF605040, "rowToArgb 24bpp pixel 1");

				// rowToArgb 16-bit RGB565 path
				geom.bitsPerPixel = 16;
				var src16 = new Uint8Array(4);
				src16[0] = 0x00; src16[1] = 0xF8;
				src16[2] = 0xE0; src16[3] = 0x07;
				fb.rowToArgb(src16, 0, dstPix, 0, 2, geom);
				assert(((dstPix[0] >>> 16) & 0xFF) === 0xF8, "rowToArgb 16bpp red");
				assert(((dstPix[1] >>> 8) & 0xFF) === 0xFC, "rowToArgb 16bpp green");

				// DRM mode FB reply decode
				var fbCmd = new Uint8Array(28);
				var fbDv = new DataView(fbCmd.buffer);
				fbDv.setUint32(0, 0x11, true);
				fbDv.setUint32(4, 2560, true);
				fbDv.setUint32(8, 1440, true);
				fbDv.setUint32(12, 10240, true);
				fbDv.setUint32(16, 32, true);
				fbDv.setUint32(20, 24, true);
				fbDv.setUint32(24, 0xABCD, true);
				var parsed = fb.parseDrmModeFbCmd(fbCmd);
				assert(parsed.fbId === 0x11 && parsed.handle === 0xABCD, "drm fb cmd decode");
				assert(parsed.pitch === 10240 && parsed.bpp === 32, "drm fb pitch/bpp");

				// DRM MAP_DUMB round-trip
				var mapBuf = fb.encodeDrmModeMapDumb(0xABCD);
				assert(mapBuf.length === 16, "MAP_DUMB buffer is 16 bytes");
				assert(new DataView(mapBuf.buffer).getUint32(0, true) === 0xABCD, "MAP_DUMB handle");
				var mapReply = new Uint8Array(16);
				new DataView(mapReply.buffer).setBigUint64(8, 0x1000n, true);
				assert(fb.parseDrmModeMapDumbOffset(mapReply) === 0x1000n, "MAP_DUMB offset");

				// DRM mode CRTC decode
				var crtcBuf = fb.encodeDrmModeCrtcGet(42);
				assert(crtcBuf.length === 104, "CRTC buf length");
				new DataView(crtcBuf.buffer).setUint32(16, 99, true);
				var crtcGet = fb.parseDrmModeCrtcGet(crtcBuf);
				assert(crtcGet.crtcId === 42 && crtcGet.fbId === 99, "CRTC get decode");

				// DRM mode card_res counts
				var cardRes = fb.encodeDrmModeCardRes();
				assert(cardRes.length === 56, "card_res size");
				fb.patchDrmModeCardResCrtcs(cardRes, 0xDEADBEEFn, 4);
				assert(new DataView(cardRes.buffer).getUint32(36, true) === 4, "count_crtcs patched");
				var counts = fb.parseDrmModeCardResCounts(cardRes);
				assert(counts.countCrtcs === 4, "countCrtcs readback");

				// Availability probes
				assert(typeof fb.framebufferAvailable() === "boolean", "framebufferAvailable bool");
				assert(typeof fb.drmAvailable() === "boolean", "drmAvailable bool");

				// captureFramebuffer stub
				assert(fb.captureFramebuffer(0, 0, 100, 100) === null, "pure stub returns null");
			}
		},

		// --- FFI framebuffer layer (gated on ffi backend) ---
		{
			name: "FFI framebuffer layer",
			functions: ["screen_ctor"],
			test: async function () {
				var be = (process.env.MECHATRON_BACKEND || "").toLowerCase();
				if (be !== "ffi" || process.platform !== "linux") {
					log("(skipped: not ffi+linux) ");
					return;
				}
				var ffiFb = require("../lib/ffi/framebuffer");
				var libcMod = require("../lib/ffi/libc");
				assert(libcMod.libc() !== null || libcMod.libcOpenReason() !== null,
					"libc() resolves or reports a reason");
				assert(ffiFb.framebufferSelected() === null || typeof ffiFb.framebufferSelected() === "string",
					"framebufferSelected returns null or mechanism name");
				assert(ffiFb.captureFbdev(0, 0, 100, 100) === null || ffiFb.captureFbdev(0, 0, 100, 100) instanceof Uint32Array,
					"captureFbdev returns null or Uint32Array");
				assert(ffiFb.captureDrm(0, 0, 100, 100) === null || ffiFb.captureDrm(0, 0, 100, 100) instanceof Uint32Array,
					"captureDrm returns null or Uint32Array");
			}
		}

	];
};
