////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Mouse Test Module                              //
//                                                                            //
//  Exercises Mouse class using the modern mechatron API.                     //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, waitForAsync) {

	var Mouse = mechatron.Mouse;

	return [
		// ---- pure-function unit tests (no backend calls) ----

		{
			name: "button conversion functions",
			functions: [],
			unit: true,
			test: function () {
				var IS_BUN = typeof globalThis.Bun !== "undefined";
				var constants = IS_BUN
					? require("../lib/mouse/constants")
					: require("../dist/mouse/constants");

				// xButton: mechatron → X11 button number
				assert(constants.xButton(constants.BUTTON_LEFT) === 1, "xButton LEFT=1");
				assert(constants.xButton(constants.BUTTON_MID) === 2, "xButton MID=2");
				assert(constants.xButton(constants.BUTTON_RIGHT) === 3, "xButton RIGHT=3");
				assert(constants.xButton(constants.BUTTON_X1) === 8, "xButton X1=8");
				assert(constants.xButton(constants.BUTTON_X2) === 9, "xButton X2=9");
				assert(constants.xButton(99) === null, "xButton invalid=null");
				assert(constants.xButton(-1) === null, "xButton negative=null");

				// evdevButton: mechatron → BTN_* evdev code
				assert(constants.evdevButton(constants.BUTTON_LEFT) === constants.BTN_LEFT, "evdevButton LEFT");
				assert(constants.evdevButton(constants.BUTTON_MID) === constants.BTN_MIDDLE, "evdevButton MID");
				assert(constants.evdevButton(constants.BUTTON_RIGHT) === constants.BTN_RIGHT, "evdevButton RIGHT");
				assert(constants.evdevButton(constants.BUTTON_X1) === constants.BTN_SIDE, "evdevButton X1");
				assert(constants.evdevButton(constants.BUTTON_X2) === constants.BTN_EXTRA, "evdevButton X2");
				assert(constants.evdevButton(99) === null, "evdevButton invalid=null");

				// clutterButton: mechatron → Clutter button number
				assert(constants.clutterButton(constants.BUTTON_LEFT) === 1, "clutterButton LEFT=1");
				assert(constants.clutterButton(constants.BUTTON_MID) === 2, "clutterButton MID=2");
				assert(constants.clutterButton(constants.BUTTON_RIGHT) === 3, "clutterButton RIGHT=3");
				assert(constants.clutterButton(constants.BUTTON_X1) === 8, "clutterButton X1=8");
				assert(constants.clutterButton(constants.BUTTON_X2) === 9, "clutterButton X2=9");
				assert(constants.clutterButton(99) === null, "clutterButton invalid=null");
			}
		},

		// ---- construction / property tests (no backend calls) ----

		{
			name: "autoDelay is Range",
			functions: ["mouse_ctor"],
			test: async function () {
				var m = new Mouse();
				assert(m.autoDelay instanceof mechatron.Range, "autoDelay is Range");
			}
		},

		{
			name: "clone preserves autoDelay",
			functions: ["mouse_ctor"],
			test: async function () {
				var m = new Mouse();
				var mc = m.clone();
				assert(mc.autoDelay instanceof mechatron.Range, "clone autoDelay");
			}
		},

		{
			name: "copy constructor preserves autoDelay",
			functions: ["mouse_ctor"],
			test: async function () {
				var m = new Mouse();
				var mCopy = new Mouse(m);
				assert(mCopy.autoDelay instanceof mechatron.Range, "copy ctor autoDelay");
			}
		},

		// ---- getPos standalone ----

		{
			name: "getPos returns point",
			functions: ["mouse_getPos"],
			test: async function () {
				var pos = await Mouse.getPos();
				assert(typeof pos.x === "number" && typeof pos.y === "number",
					"getPos returns point");
			}
		},

		// ---- setPos + getPos round-trip ----

		{
			name: "setPos + getPos round-trip",
			functions: ["mouse_setPos", "mouse_getPos"],
			test: async function () {
				var old = await Mouse.getPos();
				await Mouse.setPos(100, 200);
				mechatron.Timer.sleep(10);
				var p = await Mouse.getPos();
				assert(p.x === 100 && p.y === 200,
					"setPos 100,200: got " + p.x + "," + p.y);
				await Mouse.setPos(50, 50);
				p = await Mouse.getPos();
				assert(p.x === 50 && p.y === 50,
					"setPos 50,50: got " + p.x + "," + p.y);
				await Mouse.setPos(old);
			}
		},

		// ---- setPos fire-and-forget (no getPos readback) ----

		{
			name: "setPos fire-and-forget",
			functions: ["mouse_setPos"],
			test: async function () {
				await Mouse.setPos(200, 150);
				await Mouse.setPos(50, 50);
			}
		},

		// ---- press + getState ----

		{
			name: "press left shows pressed state",
			functions: ["mouse_press", "mouse_release", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.press(mechatron.BUTTON_LEFT);
				assert(await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_LEFT)) === true;
				}, 500), "left pressed in state");
				await m.release(mechatron.BUTTON_LEFT);
			}
		},

		// ---- release + getState ----

		{
			name: "release left shows released state",
			functions: ["mouse_press", "mouse_release", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.press(mechatron.BUTTON_LEFT);
				await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_LEFT)) === true;
				}, 500);
				await m.release(mechatron.BUTTON_LEFT);
				assert(await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_LEFT)) === false;
				}, 500), "left released in state");
			}
		},

		// ---- click (press+release) + getState ----

		{
			name: "click right leaves released state",
			functions: ["mouse_press", "mouse_release", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.click(mechatron.BUTTON_RIGHT);
				assert(await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_RIGHT)) === false;
				}, 500), "right released after click");
			}
		},

		{
			name: "press mid + getState object + release",
			functions: ["mouse_press", "mouse_release", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.press(mechatron.BUTTON_MID);
				assert(await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_MID)) === true;
				}, 500), "mid pressed in state");
				var bState = await Mouse.getState();
				assert(typeof bState === "object", "getState returns object");
				assert(bState[mechatron.BUTTON_MID] === true, "mid pressed in state obj");
				await m.release(mechatron.BUTTON_MID);
			}
		},

		{
			name: "click left leaves released state",
			functions: ["mouse_press", "mouse_release", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.click(mechatron.BUTTON_LEFT);
				assert(await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_LEFT)) === false;
				}, 500), "left released after click");
			}
		},

		// ---- scrollV standalone ----

		{
			name: "scrollV up and down",
			functions: ["mouse_scrollV"],
			test: async function () {
				var m = new Mouse();
				await m.scrollV(1);
				await m.scrollV(-1);
				await m.scrollV(3);
				await m.scrollV(-3);
			}
		},

		// ---- scrollH standalone ----

		{
			name: "scrollH left and right",
			functions: ["mouse_scrollH"],
			test: async function () {
				var m = new Mouse();
				await m.scrollH(1);
				await m.scrollH(-1);
				await m.scrollH(2);
				await m.scrollH(-2);
			}
		},

		// ---- press/release extended buttons ----

		{
			name: "press and release X1 button",
			functions: ["mouse_press", "mouse_release", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.press(mechatron.BUTTON_X1);
				await m.release(mechatron.BUTTON_X1);
				assert(typeof (await Mouse.getState(mechatron.BUTTON_X1)) === "boolean",
					"BUTTON_X1 getState bool");
			}
		},

		{
			name: "press and release X2 button",
			functions: ["mouse_press", "mouse_release", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.press(mechatron.BUTTON_X2);
				await m.release(mechatron.BUTTON_X2);
				assert(typeof (await Mouse.getState(mechatron.BUTTON_X2)) === "boolean",
					"BUTTON_X2 getState bool");
			}
		},

		// ---- press/release unknown button ----

		{
			name: "press and release unknown button 99",
			functions: ["mouse_press", "mouse_release"],
			test: async function () {
				var m = new Mouse();
				await m.press(99);
				await m.release(99);
				assert((await Mouse.getState(99)) === false,
					"unknown button getState=false");
			}
		},

		// ---- getState() returns object ----

		{
			name: "getState() returns all-buttons object",
			functions: ["mouse_getButtonState"],
			test: async function () {
				var mState = await Mouse.getState();
				assert(typeof mState === "object", "getState() returns all buttons");
			}
		}
	];
};
