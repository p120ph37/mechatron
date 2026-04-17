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

	async function testWindow() {
		log("  Window... ");

		async function waitForAsync(condFn, timeoutMs) {
			for (let elapsed = 0; elapsed < timeoutMs; elapsed += 5) {
				if (await condFn()) return true;
				await new Promise(r => setTimeout(r, 5));
			}
			return false;
		}

		var Window = mechatron.Window;
		var Bounds = mechatron.Bounds;
		var Point  = mechatron.Point;

		// --- Invalid window ---
		var w1 = new Window();
		var w2 = new Window();
		assert(!await w1.isValid(), "empty invalid");
		assert(w1.getHandle() === 0, "empty handle=0");
		assert(await w1.getTitle() === "", "empty title empty");
		assert(await w1.getPID() === 0, "empty pid=0");

		assert(await w1.setHandle(0), "setHandle 0");
		assert(!await w1.setHandle(8888), "setHandle 8888 fails");

		assert(!await w1.isTopMost(), "empty !topmost");
		assert(!await w1.isBorderless(), "empty !borderless");
		assert(!await w1.isMinimized(), "empty !minimized");
		assert(!await w1.isMaximized(), "empty !maximized");

		// Exercise setters on invalid window (no-op, no crash)
		await w1.setTopMost(false);
		await w1.setBorderless(false);
		await w1.setMinimized(false);
		await w1.setMaximized(false);
		await w1.setTitle("");
		await w1.close();

		var b = await w1.getBounds();
		assert(b instanceof Bounds, "getBounds returns Bounds");
		assert(b.eq(0), "empty bounds eq 0");

		var c = await w1.getClient();
		assert(c instanceof Bounds, "getClient returns Bounds");

		var mp = await w1.mapToClient(20, 20);
		assert(mp instanceof Point, "mapToClient returns Point");
		var ms = await w1.mapToScreen(20, 20);
		assert(ms instanceof Point, "mapToScreen returns Point");

		// Equality
		assert(w1.eq(w2), "empty eq empty");
		assert(!w1.ne(w2), "empty !ne empty");
		assert(w1.eq(0), "empty eq 0");
		assert(w1.ne(8888), "empty ne 8888");

		// --- Window clone ---
		var wc = w1.clone();
		assert(wc.eq(w1), "clone eq original");

		// --- getProcess ---
		var wp = await w1.getProcess();
		assert(typeof wp === "object", "getProcess returns object");

		// --- getList ---
		var list = await Window.getList();
		assert(list instanceof Array, "getList is array");

		// --- getActive ---
		var active = await Window.getActive();
		assert(active instanceof Window, "getActive returns Window");

		// mapToClient/mapToScreen overloads (no args, Point obj)
		var mp0 = await w1.mapToClient();
		assert(mp0 instanceof Point, "mapToClient() no args");
		var ms0 = await w1.mapToScreen();
		assert(ms0 instanceof Point, "mapToScreen() no args");
		var mpPt = await w1.mapToClient(new Point(10, 20));
		assert(mpPt instanceof Point, "mapToClient(Point)");
		var msPt = await w1.mapToScreen(new Point(10, 20));
		assert(msPt instanceof Point, "mapToScreen(Point)");
		var mpObj = await w1.mapToClient({ x: 5, y: 5 });
		assert(mpObj instanceof Point, "mapToClient(obj)");
		var msObj = await w1.mapToScreen({ x: 5, y: 5 });
		assert(msObj instanceof Point, "mapToScreen(obj)");

		// setBounds/setClient overloads (no-crash on invalid window)
		await w1.setBounds();
		await w1.setBounds(0, 0, 100, 100);
		await w1.setBounds({ x: 0, y: 0, w: 100, h: 100 });
		await w1.setClient();
		await w1.setClient(0, 0, 100, 100);
		await w1.setClient({ x: 0, y: 0, w: 100, h: 100 });

		// Window copy constructor
		var wCopy = new Window(w1);
		assert(wCopy.eq(w1), "Window copy ctor eq");

		// Test window setters/getters on a valid window if one exists
		if (list.length > 0) {
			var vw = list[0];
			// setBounds/getBounds round-trip
			var origBounds = await vw.getBounds();
			assert(origBounds instanceof Bounds, "valid getBounds");

			// setTopMost/setBorderless/setMinimized/setMaximized (just exercise them)
			await vw.setTopMost(false);
			await vw.setBorderless(false);

			// setTitle (no-crash test)
			var origTitle = await vw.getTitle();
			if (origTitle) {
				await vw.setTitle(origTitle);
			}

			// Exercise more methods on valid windows
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

			// setMinimized/setMaximized
			await vw.setMinimized(false);
			await vw.setMaximized(false);

			// close (on a cloned handle to avoid disrupting test)
			var vwClone = vw.clone();
			assert(vwClone.eq(vw), "valid clone eq");
		}

		// Window.setActive (exercise on both invalid and valid)
		await Window.setActive(w1);
		var activeW = await Window.getActive();
		if (await activeW.isValid()) {
			await Window.setActive(activeW);
		}

		// --- Stale-handle probe (Linux FFI): exercise the
		//     XGetWindowProperty-on-destroyed-window error arm inside
		//     winIsValid (lib/ffi/window.ts:34).  Spawn a throwaway
		//     xmessage, confirm its handle, destroy the window via
		//     mechatron (destroyWindow), then reuse the now-stale
		//     handle in setHandle() — winIsValid issues
		//     GetProperty(_NET_WM_PID, staleHandle) via xproto, which
		//     the X server answers with a BadWindow error that the
		//     xproto client catches; winIsValid returns false;
		//     setHandle returns false.  Timeouts are kept short
		//     (bun test default per-test timeout is 5s) and any
		//     step that can't complete falls through to the
		//     skip path — the primary test here is the stale-handle
		//     check after a successful destroy; xmessage-not-listed
		//     hosts simply skip without failing the suite.
		if (process.platform === "linux" &&
			mechatron.getBackend("window") === "ffi") {
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

		// --- isAxEnabled ---
		assert(typeof await Window.isAxEnabled() === "boolean", "isAxEnabled bool");

		var pa1 = Window.getList();
		assert(pa1 instanceof Promise, "getList returns Promise");

		log("OK\n");
		return true;
	}

	return {
		testWindow: testWindow,
	};
};
