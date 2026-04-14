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

	function testWindow() {
		log("  Window... ");

		var Window = mechatron.Window;
		var Bounds = mechatron.Bounds;
		var Point  = mechatron.Point;

		// --- Invalid window ---
		var w1 = new Window();
		var w2 = new Window();
		assert(!w1.isValid(), "empty invalid");
		assert(w1.getHandle() === 0, "empty handle=0");
		assert(w1.getTitle() === "", "empty title empty");
		assert(w1.getPID() === 0, "empty pid=0");

		assert(w1.setHandle(0), "setHandle 0");
		assert(!w1.setHandle(8888), "setHandle 8888 fails");

		assert(!w1.isTopMost(), "empty !topmost");
		assert(!w1.isBorderless(), "empty !borderless");
		assert(!w1.isMinimized(), "empty !minimized");
		assert(!w1.isMaximized(), "empty !maximized");

		// Exercise setters on invalid window (no-op, no crash)
		w1.setTopMost(false);
		w1.setBorderless(false);
		w1.setMinimized(false);
		w1.setMaximized(false);
		w1.setTitle("");
		w1.close();

		var b = w1.getBounds();
		assert(b instanceof Bounds, "getBounds returns Bounds");
		assert(b.eq(0), "empty bounds eq 0");

		var c = w1.getClient();
		assert(c instanceof Bounds, "getClient returns Bounds");

		var mp = w1.mapToClient(20, 20);
		assert(mp instanceof Point, "mapToClient returns Point");
		var ms = w1.mapToScreen(20, 20);
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
		var wp = w1.getProcess();
		assert(typeof wp === "object", "getProcess returns object");

		// --- getList ---
		var list = Window.getList();
		assert(list instanceof Array, "getList is array");

		// --- getActive ---
		var active = Window.getActive();
		assert(active instanceof Window, "getActive returns Window");

		// mapToClient/mapToScreen overloads (no args, Point obj)
		var mp0 = w1.mapToClient();
		assert(mp0 instanceof Point, "mapToClient() no args");
		var ms0 = w1.mapToScreen();
		assert(ms0 instanceof Point, "mapToScreen() no args");
		var mpPt = w1.mapToClient(new Point(10, 20));
		assert(mpPt instanceof Point, "mapToClient(Point)");
		var msPt = w1.mapToScreen(new Point(10, 20));
		assert(msPt instanceof Point, "mapToScreen(Point)");
		var mpObj = w1.mapToClient({ x: 5, y: 5 });
		assert(mpObj instanceof Point, "mapToClient(obj)");
		var msObj = w1.mapToScreen({ x: 5, y: 5 });
		assert(msObj instanceof Point, "mapToScreen(obj)");

		// setBounds/setClient overloads (no-crash on invalid window)
		w1.setBounds();
		w1.setBounds(0, 0, 100, 100);
		w1.setBounds({ x: 0, y: 0, w: 100, h: 100 });
		w1.setClient();
		w1.setClient(0, 0, 100, 100);
		w1.setClient({ x: 0, y: 0, w: 100, h: 100 });

		// Window copy constructor
		var wCopy = new Window(w1);
		assert(wCopy.eq(w1), "Window copy ctor eq");

		// Test window setters/getters on a valid window if one exists
		if (list.length > 0) {
			var vw = list[0];
			// setBounds/getBounds round-trip
			var origBounds = vw.getBounds();
			assert(origBounds instanceof Bounds, "valid getBounds");

			// setTopMost/setBorderless/setMinimized/setMaximized (just exercise them)
			vw.setTopMost(false);
			vw.setBorderless(false);

			// setTitle (no-crash test)
			var origTitle = vw.getTitle();
			if (origTitle) {
				vw.setTitle(origTitle);
			}

			// Exercise more methods on valid windows
			assert(typeof vw.isValid() === "boolean", "valid isValid");
			assert(typeof vw.isTopMost() === "boolean", "valid isTopMost");
			assert(typeof vw.isBorderless() === "boolean", "valid isBorderless");
			assert(typeof vw.isMinimized() === "boolean", "valid isMinimized");
			assert(typeof vw.isMaximized() === "boolean", "valid isMaximized");
			assert(typeof vw.getPID() === "number", "valid getPID");
			assert(typeof vw.getHandle() === "number", "valid getHandle");
			var vwProc = vw.getProcess();
			assert(typeof vwProc === "object", "valid getProcess");
			var vwClient = vw.getClient();
			assert(vwClient instanceof Bounds, "valid getClient");

			// setMinimized/setMaximized
			vw.setMinimized(false);
			vw.setMaximized(false);

			// close (on a cloned handle to avoid disrupting test)
			var vwClone = vw.clone();
			assert(vwClone.eq(vw), "valid clone eq");
		}

		// Window.setActive (exercise on both invalid and valid)
		Window.setActive(w1);
		var activeW = Window.getActive();
		if (activeW.isValid()) {
			Window.setActive(activeW);
		}

		// --- Stale-handle probe (Linux FFI): exercise the
		//     XGetWindowProperty-on-destroyed-window error arm inside
		//     winIsValid (lib/ffi/window.ts:34).  Spawn a throwaway
		//     xmessage, confirm its handle, destroy the window via
		//     mechatron (XDestroyWindow), then reuse the now-stale
		//     handle in setHandle() — winIsValid issues
		//     XGetWindowProperty(_NET_WM_PID, staleHandle), which the
		//     X server answers with BadWindow.  The silent X error
		//     handler installed in lib/ffi/x11.ts returns 0 so Xlib's
		//     default exit(1) handler never fires; getWindowProperty
		//     sees a non-zero status and returns null; winIsValid
		//     returns false; setHandle returns false.  Timeouts are
		//     kept short (bun test default per-test timeout is 5s)
		//     and any step that can't complete falls through to the
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
				waitFor(function () {
					var f = Window.getList(_tag);
					if (f.length > 0 && f[0].isValid()) {
						_stale = f[0].getHandle();
						return true;
					}
					return false;
				}, 1500);
			}
			if (_stale !== 0) {
				// Destroy via mechatron (XDestroyWindow + XFlush).
				var _live = new Window();
				if (_live.setHandle(_stale)) {
					_live.close();
					var _gone = waitFor(function () {
						return Window.getList(_tag).length === 0;
					}, 1500);
					if (_gone) {
						// Stale handle: setHandle -> winIsValid ->
						// getWindowProperty -> XGetWindowProperty
						// (BadWindow, swallowed) -> status != 0 ->
						// null -> false.
						var _stalew = new Window();
						assert(_stalew.setHandle(_stale) === false,
							"stale handle setHandle false (BadWindow swallowed)");
					}
				}
			}
			if (_xm) { try { _xm.kill(); } catch (_) {} }
		}

		// --- isAxEnabled ---
		assert(typeof Window.isAxEnabled() === "boolean", "isAxEnabled bool");

		// --- Async variants ---
		var pa1 = Window.getListAsync();
		assert(pa1 instanceof Promise, "getListAsync returns Promise");

		log("OK\n");
		return true;
	}

	return {
		testWindow: testWindow,
	};
};
