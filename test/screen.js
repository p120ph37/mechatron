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

		// --- Screen pure class tests (no backend) ---
		{
			name: "Screen class pure methods",
			functions: [], unit: true,
			test: async function () {
				// Default constructor — no backend needed
				var s = new Screen();
				assert(s.getBounds() instanceof Bounds, "default getBounds");
				assert(s.getUsable() instanceof Bounds, "default getUsable");
				assert(s.getBounds().isZero(), "default bounds is zero");
				assert(s.getUsable().isZero(), "default usable is zero");

				// Bounds+usable constructor
				var b = new Bounds(0, 0, 1920, 1080);
				var u = new Bounds(0, 48, 1920, 1032);
				var s2 = new Screen(b, u);
				assert(s2.getBounds().eq(b), "custom bounds");
				assert(s2.getUsable().eq(u), "custom usable");

				// isLandscape / isPortrait
				assert(s2.isLandscape() === true, "1920x1080 is landscape");
				assert(s2.isPortrait() === false, "1920x1080 not portrait");

				var tall = new Screen(new Bounds(0, 0, 1080, 1920), new Bounds());
				assert(tall.isPortrait() === true, "1080x1920 is portrait");
				assert(tall.isLandscape() === false, "1080x1920 not landscape");

				var sq = new Screen(new Bounds(0, 0, 500, 500), new Bounds());
				assert(sq.isPortrait() === false, "square not portrait");
				assert(sq.isLandscape() === false, "square not landscape");

				// clone
				var cl = s2.clone();
				assert(cl.getBounds().eq(s2.getBounds()), "clone bounds eq");
				assert(cl.getUsable().eq(s2.getUsable()), "clone usable eq");

				// copy constructor
				var cp = new Screen(s2);
				assert(cp.getBounds().eq(s2.getBounds()), "copy ctor bounds eq");

				// Static: empty state
				assert(Screen.getList().length >= 0, "getList array");
				assert(typeof Screen.isCompositing() === "boolean", "isCompositing bool");
				Screen.setCompositing(false);
				assert(Screen.isCompositing() === true, "setCompositing is no-op");

				var tb = Screen.getTotalBounds();
				assert(tb instanceof Bounds, "getTotalBounds returns Bounds");
				var tu = Screen.getTotalUsable();
				assert(tu instanceof Bounds, "getTotalUsable returns Bounds");

				// getScreen with coordinates (returns null when no screens loaded)
				var found = Screen.getScreen(100, 200);
				assert(found === null || found instanceof Screen, "getScreen(x,y) type");
				var Point = mechatron.Point;
				var found2 = Screen.getScreen(new Point(50, 50));
				assert(found2 === null || found2 instanceof Screen, "getScreen(Point) type");
				var found3 = Screen.getScreen({ x: 10, y: 20 });
				assert(found3 === null || found3 instanceof Screen, "getScreen({x,y}) type");

				// getScreen with window-like object (async path)
				var mockWin = {
					isValid: function() { return Promise.resolve(true); },
					getBounds: function() { return Promise.resolve({ x: 0, y: 0, w: 100, h: 100 }); },
					getHandle: function() { return 0; }
				};
				var foundWin = await Screen.getScreen(mockWin);
				assert(foundWin === null || foundWin instanceof Screen, "getScreen(window) type");

				// getMain
				var main = Screen.getMain();
				assert(main === null || main instanceof Screen, "getMain type");

				// unionBounds (exported for testing)
				var IS_BUN = typeof globalThis.Bun !== "undefined";
				if (IS_BUN) {
					var unionBounds = require("../lib/screen/Screen")._unionBoundsForTests;
					// Both zero → returns second
					var r0 = unionBounds({x:0,y:0,w:0,h:0}, {x:10,y:20,w:30,h:40});
					assert(r0.x === 10 && r0.y === 20 && r0.w === 30 && r0.h === 40, "union zero+rect = rect");
					// First zero → returns second
					var r1 = unionBounds({x:5,y:5,w:100,h:100}, {x:0,y:0,w:0,h:0});
					assert(r1.x === 5 && r1.w === 100, "union rect+zero = rect");
					// Both non-zero → bounding box
					var r2 = unionBounds({x:0,y:0,w:100,h:100}, {x:50,y:50,w:200,h:200});
					assert(r2.x === 0 && r2.y === 0, "union overlap origin");
					assert(r2.w === 250 && r2.h === 250, "union overlap size");
					// Non-overlapping rects
					var r3 = unionBounds({x:0,y:0,w:10,h:10}, {x:100,y:100,w:20,h:20});
					assert(r3.x === 0 && r3.y === 0, "union disjoint origin");
					assert(r3.w === 120 && r3.h === 120, "union disjoint size");

					// intersectBounds (screen-x11) — only loadable when $DISPLAY is set
					if (process.env.DISPLAY) {
						var intersect = require("../lib/nolib/screen-x11")._intersectBoundsForTests;
						var i0 = intersect({x:0,y:0,w:100,h:100}, {x:50,y:50,w:100,h:100});
						assert(i0.x === 50 && i0.y === 50, "intersect overlap origin");
						assert(i0.w === 50 && i0.h === 50, "intersect overlap size");
						var i1 = intersect({x:0,y:0,w:10,h:10}, {x:100,y:100,w:20,h:20});
						assert(i1.w === 0 && i1.h === 0, "intersect disjoint empty");
						var i2 = intersect({x:0,y:0,w:50,h:50}, {x:0,y:0,w:50,h:50});
						assert(i2.x === 0 && i2.w === 50 && i2.h === 50, "intersect identical");
					}
				}
			}
		},

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
				assert(foundWin === null || (typeof foundWin === "object" && typeof foundWin.x === "number"), "getScreen by window-like");

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
					// Portal backends depend on PipeWire and gext depends on
					// Shell.Screenshot — both may be limited in headless CI.
					// Treat as skip, not failure.
					var be = mechatron.getBackend("screen") || "";
					if (be.indexOf("[portal]") !== -1 || be.indexOf("[gext]") !== -1) {
						log("(skipped: capture backend unavailable) ");
					} else {
						assert(false, "Screen.grabScreen returned false but matrix marked it ok");
					}
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

		// --- Portal token state management ---
		{
			name: "Screen portal token get/set",
			functions: ["screen_getPortalToken", "screen_setPortalToken"],
			test: async function () {
				var getNative = mechatron.getNative || mechatron._getNative;
				var native = getNative("screen");
				assert(typeof native.screen_getPortalToken === "function", "getPortalToken exists");
				assert(typeof native.screen_setPortalToken === "function", "setPortalToken exists");

				var initial = await native.screen_getPortalToken();
				assert(initial === null || typeof initial === "string", "initial token is null or string");

				var testToken = "test_restore_token_" + Date.now();
				await native.screen_setPortalToken(testToken);
				var stored = await native.screen_getPortalToken();
				assert(stored === testToken, "token round-trips");

				await native.screen_setPortalToken(initial);
			}
		},

		// --- Framebuffer / DRM pure-encoding tests ---
		{
			name: "Framebuffer/DRM pure-encoding helpers",
			functions: [], unit: true,
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

				// Availability probe
				assert(typeof fb.framebufferAvailable() === "boolean", "framebufferAvailable bool");

				// rowToArgb unsupported bpp (8-bit) — emits opaque black
				geom.bitsPerPixel = 8;
				var src8 = new Uint8Array([0xAA, 0xBB]);
				fb.rowToArgb(src8, 0, dstPix, 0, 2, geom);
				assert(dstPix[0] === 0xFF000000, "rowToArgb 8bpp pixel 0 = black");
				assert(dstPix[1] === 0xFF000000, "rowToArgb 8bpp pixel 1 = black");
			}
		},

	];
};
