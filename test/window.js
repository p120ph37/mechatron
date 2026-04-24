////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Window Test Module                             //
//                                                                            //
//  Exercises Window class using the modern mechatron API.                    //
//  Returns an array of annotated test entries for the matrix runner.         //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, waitForAsync) {

	var Window = mechatron.Window;
	var Bounds = mechatron.Bounds;
	var Point  = mechatron.Point;

	return [
		// ── Invalid window: core invalid-handle path ──
		{
			name: "invalid window basics",
			functions: ["window_isValid"],
			test: async function () {
				var w1 = new Window();
				assert(!await w1.isValid(), "empty invalid");
				assert(w1.getHandle() === 0, "empty handle=0");
				assert(await w1.getTitle() === "", "empty title empty");
				assert(await w1.getPID() === 0, "empty pid=0");
			}
		},
		{
			name: "invalid window isTopMost",
			functions: ["window_isTopMost"],
			test: async function () {
				var w = new Window();
				assert(!await w.isTopMost(), "empty !topmost");
			}
		},
		{
			name: "invalid window isBorderless",
			functions: ["window_isBorderless"],
			test: async function () {
				var w = new Window();
				assert(!await w.isBorderless(), "empty !borderless");
			}
		},
		{
			name: "invalid window isMinimized",
			functions: ["window_isMinimized"],
			test: async function () {
				var w = new Window();
				assert(!await w.isMinimized(), "empty !minimized");
			}
		},
		{
			name: "invalid window isMaximized",
			functions: ["window_isMaximized"],
			test: async function () {
				var w = new Window();
				assert(!await w.isMaximized(), "empty !maximized");
			}
		},
		// ── Setters on invalid window (no-crash) ──
		{
			name: "invalid window setTopMost",
			functions: ["window_setTopMost"],
			test: async function () {
				var w = new Window();
				await w.setTopMost(false);
			}
		},
		{
			name: "invalid window setBorderless",
			functions: ["window_setBorderless"],
			test: async function () {
				var w = new Window();
				await w.setBorderless(false);
			}
		},
		{
			name: "invalid window setMinimized",
			functions: ["window_setMinimized"],
			test: async function () {
				var w = new Window();
				await w.setMinimized(false);
			}
		},
		{
			name: "invalid window setMaximized",
			functions: ["window_setMaximized"],
			test: async function () {
				var w = new Window();
				await w.setMaximized(false);
			}
		},
		{
			name: "invalid window setTitle",
			functions: ["window_setTitle"],
			test: async function () {
				var w = new Window();
				await w.setTitle("");
			}
		},
		{
			name: "invalid window close",
			functions: ["window_close"],
			test: async function () {
				var w = new Window();
				await w.close();
			}
		},
		// ── getBounds / getClient on invalid window ──
		{
			name: "invalid window getBounds",
			functions: ["window_getBounds"],
			test: async function () {
				var w = new Window();
				var b = await w.getBounds();
				assert(b instanceof Bounds, "getBounds returns Bounds");
				assert(b.eq(0), "empty bounds eq 0");
			}
		},
		{
			name: "invalid window getClient",
			functions: ["window_getClient"],
			test: async function () {
				var w = new Window();
				var c = await w.getClient();
				assert(c instanceof Bounds, "getClient returns Bounds");
			}
		},
		// ── mapToClient / mapToScreen ──
		{
			name: "invalid window mapToClient",
			functions: ["window_mapToClient"],
			test: async function () {
				var w = new Window();
				var mp = await w.mapToClient(20, 20);
				assert(mp instanceof Point, "mapToClient returns Point");
			}
		},
		{
			name: "invalid window mapToScreen",
			functions: ["window_mapToScreen"],
			test: async function () {
				var w = new Window();
				var ms = await w.mapToScreen(20, 20);
				assert(ms instanceof Point, "mapToScreen returns Point");
			}
		},
		// ── Clone / copy / equality (pure JS) ──
		{
			name: "window equality",
			functions: ["window_ctor"],
			test: async function () {
				var w1 = new Window();
				var w2 = new Window();
				assert(w1.eq(w2), "empty eq empty");
				assert(!w1.ne(w2), "empty !ne empty");
				assert(w1.eq(0), "empty eq 0");
				assert(w1.ne(8888), "empty ne 8888");
			}
		},
		{
			name: "window clone",
			functions: ["window_ctor"],
			test: async function () {
				var w = new Window();
				var wc = w.clone();
				assert(wc.eq(w), "clone eq original");
			}
		},
		{
			name: "window copy constructor",
			functions: ["window_ctor"],
			test: async function () {
				var w = new Window();
				var wCopy = new Window(w);
				assert(wCopy.eq(w), "Window copy ctor eq");
			}
		},
		// ── setHandle ──
		{
			name: "setHandle",
			functions: ["window_setHandle"],
			test: async function () {
				var w = new Window();
				assert(await w.setHandle(0), "setHandle 0");
				assert(!await w.setHandle(8888), "setHandle 8888 fails");
			}
		},
		// ── getProcess on invalid ──
		{
			name: "invalid window getProcess",
			functions: ["window_getProcess"],
			test: async function () {
				var w = new Window();
				var wp = await w.getProcess();
				assert(typeof wp === "object", "getProcess returns object");
			}
		},
		// ── getList ──
		{
			name: "Window.getList",
			functions: ["window_getList"],
			test: async function () {
				var list = await Window.getList();
				assert(list instanceof Array, "getList is array");
				var pa1 = Window.getList();
				assert(pa1 instanceof Promise, "getList returns Promise");
			}
		},
		// ── getActive ──
		{
			name: "Window.getActive",
			functions: ["window_getActive"],
			test: async function () {
				var active = await Window.getActive();
				assert(active instanceof Window, "getActive returns Window");
			}
		},
		// ── mapToClient overloads ──
		{
			name: "mapToClient overloads",
			functions: ["window_mapToClient"],
			test: async function () {
				var w = new Window();
				var mp0 = await w.mapToClient();
				assert(mp0 instanceof Point, "mapToClient() no args");
				var mpPt = await w.mapToClient(new Point(10, 20));
				assert(mpPt instanceof Point, "mapToClient(Point)");
				var mpObj = await w.mapToClient({ x: 5, y: 5 });
				assert(mpObj instanceof Point, "mapToClient(obj)");
			}
		},
		// ── mapToScreen overloads ──
		{
			name: "mapToScreen overloads",
			functions: ["window_mapToScreen"],
			test: async function () {
				var w = new Window();
				var ms0 = await w.mapToScreen();
				assert(ms0 instanceof Point, "mapToScreen() no args");
				var msPt = await w.mapToScreen(new Point(10, 20));
				assert(msPt instanceof Point, "mapToScreen(Point)");
				var msObj = await w.mapToScreen({ x: 5, y: 5 });
				assert(msObj instanceof Point, "mapToScreen(obj)");
			}
		},
		// ── setBounds overloads on invalid window ──
		{
			name: "setBounds overloads on invalid window",
			functions: ["window_setBounds"],
			test: async function () {
				var w = new Window();
				await w.setBounds();
				await w.setBounds(0, 0, 100, 100);
				await w.setBounds({ x: 0, y: 0, w: 100, h: 100 });
			}
		},
		// ── setClient overloads on invalid window ──
		{
			name: "setClient overloads on invalid window",
			functions: ["window_setClient"],
			test: async function () {
				var w = new Window();
				await w.setClient();
				await w.setClient(0, 0, 100, 100);
				await w.setClient({ x: 0, y: 0, w: 100, h: 100 });
			}
		},
		// ── Valid window tests (require getList to find a window) ──
		{
			name: "valid window getters",
			functions: ["window_getList", "window_isValid", "window_getBounds", "window_isTopMost", "window_isBorderless", "window_isMinimized", "window_isMaximized", "window_getPID", "window_getHandle", "window_getProcess", "window_getClient"],
			test: async function () {
				var list = await Window.getList();
				if (list.length === 0) return;
				var vw = list[0];
				var origBounds = await vw.getBounds();
				assert(origBounds instanceof Bounds, "valid getBounds");
				assert(typeof await vw.isValid() === "boolean", "valid isValid");
				assert(typeof await vw.isTopMost() === "boolean", "valid isTopMost");
				assert(typeof await vw.isBorderless() === "boolean", "valid isBorderless");
				assert(typeof await vw.isMinimized() === "boolean", "valid isMinimized");
				assert(typeof await vw.isMaximized() === "boolean", "valid isMaximized");
				assert(typeof await vw.getPID() === "number", "valid getPID");
				assert(typeof vw.getHandle() === "number", "valid getHandle");
				var vwProc = await vw.getProcess();
				assert(typeof vwProc === "object", "valid getProcess");
				var vwClient = await vw.getClient();
				assert(vwClient instanceof Bounds, "valid getClient");
			}
		},
		{
			name: "valid window setters",
			functions: ["window_getList", "window_isValid", "window_setTopMost", "window_setBorderless", "window_setMinimized", "window_setMaximized", "window_setTitle"],
			test: async function () {
				var list = await Window.getList();
				if (list.length === 0) return;
				var vw = list[0];
				await vw.setTopMost(false);
				await vw.setBorderless(false);
				var origTitle = await vw.getTitle();
				if (origTitle) {
					await vw.setTitle(origTitle);
				}
				await vw.setMinimized(false);
				await vw.setMaximized(false);
			}
		},
		{
			name: "valid window clone",
			functions: ["window_getList", "window_isValid"],
			test: async function () {
				var list = await Window.getList();
				if (list.length === 0) return;
				var vw = list[0];
				var vwClone = vw.clone();
				assert(vwClone.eq(vw), "valid clone eq");
			}
		},
		// ── setActive ──
		{
			name: "Window.setActive",
			functions: ["window_setActive"],
			test: async function () {
				var w = new Window();
				await Window.setActive(w);
				var activeW = await Window.getActive();
				if (await activeW.isValid()) {
					await Window.setActive(activeW);
				}
			}
		},
		// ── Stale-handle probe (Linux FFI only) ──
		{
			name: "stale-handle probe (Linux FFI)",
			functions: ["window_getList", "window_isValid", "window_close", "window_setHandle"],
			test: async function () {
				if (process.platform !== "linux" ||
					mechatron.getBackend("window") !== "ffi") {
					return;
				}
				var _cpw = require("child_process");
				var _tag = "MechatronStaleProbe_" + process.pid;
				var _xm = null;
				try {
					_xm = _cpw.spawn("xmessage",
						["-name", _tag, "-timeout", "10", _tag],
						{ stdio: "ignore" });
				} catch (_) { _xm = null; }
				var _stale = 0;
				if (_xm) {
					await waitForAsync(async function () {
						var f = await Window.getList(_tag);
						if (f.length > 0 && await f[0].isValid()) {
							_stale = f[0].getHandle();
							return true;
						}
						return false;
					}, 1500);
				}
				if (_stale !== 0) {
					var _live = new Window();
					if (await _live.setHandle(_stale)) {
						await _live.close();
						var _gone = await waitForAsync(async function () {
							return (await Window.getList(_tag)).length === 0;
						}, 1500);
						if (_gone) {
							var _stalew = new Window();
							assert(await _stalew.setHandle(_stale) === false,
								"stale handle setHandle false (BadWindow swallowed)");
						}
					}
				}
				if (_xm) { try { _xm.kill(); } catch (_) {} }
			}
		},
		// ── isAxEnabled ──
		{
			name: "Window.isAxEnabled",
			functions: ["window_isAxEnabled"],
			test: async function () {
				assert(typeof await Window.isAxEnabled() === "boolean", "isAxEnabled bool");
			}
		},
		// ── Fuzz: window_getList stress loop ──
		{
			name: "window_getList fuzz (500 iterations)",
			functions: ["window_getList"],
			test: async function () {
				for (var i = 0; i < 500; i++) {
					var list = await Window.getList();
					assert(list instanceof Array, "fuzz[" + i + "] array");
					if (i % 50 === 0) {
						var filtered = await Window.getList("nonexistent_fuzz_" + i);
						assert(filtered instanceof Array, "fuzz[" + i + "] filtered");
						assert(filtered.length === 0, "fuzz[" + i + "] no matches");
					}
				}
			}
		},
	];
};
