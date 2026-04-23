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

module.exports = function (mechatron, log, assert, waitFor) {

	async function waitForAsync(condFn, timeoutMs) {
		for (var elapsed = 0; elapsed < timeoutMs; elapsed += 5) {
			if (await condFn()) return true;
			await new Promise(function (r) { setTimeout(r, 5); });
		}
		return false;
	}

	var Mouse = mechatron.Mouse;

	return [
		// ---- construction / property tests (no backend calls) ----

		{
			name: "autoDelay is Range",
			functions: [],
			test: async function () {
				var m = new Mouse();
				assert(m.autoDelay instanceof mechatron.Range, "autoDelay is Range");
			}
		},

		{
			name: "clone preserves autoDelay",
			functions: [],
			test: async function () {
				var m = new Mouse();
				var mc = m.clone();
				assert(mc.autoDelay instanceof mechatron.Range, "clone autoDelay");
			}
		},

		{
			name: "copy constructor preserves autoDelay",
			functions: [],
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

		// ---- press + getState ----

		{
			name: "press left shows pressed state",
			functions: ["mouse_press", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.press(mechatron.BUTTON_LEFT);
				assert(await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_LEFT)) === true;
				}, 200), "left pressed in state");
				await m.release(mechatron.BUTTON_LEFT);
			}
		},

		// ---- release + getState ----

		{
			name: "release left shows released state",
			functions: ["mouse_release", "mouse_getButtonState"],
			test: async function () {
				var m = new Mouse();
				await m.press(mechatron.BUTTON_LEFT);
				await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_LEFT)) === true;
				}, 200);
				await m.release(mechatron.BUTTON_LEFT);
				assert(await waitForAsync(async function () {
					return (await Mouse.getState(mechatron.BUTTON_LEFT)) === false;
				}, 200), "left released in state");
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
				}, 200), "right released after click");
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
				}, 200), "mid pressed in state");
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
				}, 200), "left released after click");
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
