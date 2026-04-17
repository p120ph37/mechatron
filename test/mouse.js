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

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip) {

	async function waitForAsync(condFn, timeoutMs) {
		for (var elapsed = 0; elapsed < timeoutMs; elapsed += 5) {
			if (await condFn()) return true;
			await new Promise(function (r) { setTimeout(r, 5); });
		}
		return false;
	}

	async function testMouse() {
		log("  Mouse... ");

		var Mouse = mechatron.Mouse;
		var m = new Mouse();

		var old = await Mouse.getPos();
		assert(typeof old.x === "number" && typeof old.y === "number", "getPos returns point");

		await Mouse.setPos(100, 200);
		mechatron.Timer.sleep(10);
		var p = await Mouse.getPos();
		var mousePosWorks = (p.x === 100 && p.y === 200);
		if (mousePosWorks) {
			await Mouse.setPos(50, 50);
			p = await Mouse.getPos();
			assert(p.x === 50 && p.y === 50, "setPos 50,50: got " + p.x + "," + p.y);
			await Mouse.setPos(old);
		} else {
			expectOrSkip("mousePos", "Mouse setPos");
			log("(setPos unavailable) ");
		}

		await m.press(mechatron.BUTTON_LEFT);
		var mousePressWorks = await waitForAsync(async function () {
			return (await Mouse.getState(mechatron.BUTTON_LEFT)) === true;
		}, 200);
		await m.release(mechatron.BUTTON_LEFT);
		var mouseReleaseWorks = mousePressWorks && await waitForAsync(async function () {
			return (await Mouse.getState(mechatron.BUTTON_LEFT)) === false;
		}, 200);
		if (mouseReleaseWorks) {
			await m.click(mechatron.BUTTON_RIGHT);
			mouseReleaseWorks = await waitForAsync(async function () {
				return (await Mouse.getState(mechatron.BUTTON_RIGHT)) === false;
			}, 200);
		}
		if (mouseReleaseWorks) {
			await m.press(mechatron.BUTTON_MID);
			assert(await waitForAsync(async function () {
				return (await Mouse.getState(mechatron.BUTTON_MID)) === true;
			}, 200), "mid pressed in state");
			var bState = await Mouse.getState();
			assert(typeof bState === "object", "getState returns object");
			assert(bState[mechatron.BUTTON_MID] === true, "mid pressed in state obj");
			await m.release(mechatron.BUTTON_MID);

			await m.click(mechatron.BUTTON_LEFT);
			assert(await waitForAsync(async function () {
				return (await Mouse.getState(mechatron.BUTTON_LEFT)) === false;
			}, 200), "left released after click");
		} else {
			expectOrSkip("mouseSim", "Mouse input simulation");
			log("(input sim unavailable) ");
			var bState = await Mouse.getState();
			assert(typeof bState === "object", "getState returns object");
		}

		await m.scrollV(1);
		await m.scrollV(-1);
		await m.scrollH(1);
		await m.scrollH(-1);

		await m.press(mechatron.BUTTON_X1);
		await m.release(mechatron.BUTTON_X1);
		await m.press(mechatron.BUTTON_X2);
		await m.release(mechatron.BUTTON_X2);
		assert(typeof (await Mouse.getState(mechatron.BUTTON_X1)) === "boolean", "BUTTON_X1 getState bool");
		assert(typeof (await Mouse.getState(mechatron.BUTTON_X2)) === "boolean", "BUTTON_X2 getState bool");

		await m.press(99);
		await m.release(99);
		assert((await Mouse.getState(99)) === false, "unknown button getState=false");

		await m.scrollV(3);
		await m.scrollV(-3);
		await m.scrollH(2);
		await m.scrollH(-2);

		assert(m.autoDelay instanceof mechatron.Range, "autoDelay is Range");

		var mc = m.clone();
		assert(mc.autoDelay instanceof mechatron.Range, "clone autoDelay");

		var mCopy = new Mouse(m);
		assert(mCopy.autoDelay instanceof mechatron.Range, "copy ctor autoDelay");

		var mState = await Mouse.getState();
		assert(typeof mState === "object", "getState() returns all buttons");

		log("OK\n");
		return true;
	}

	return {
		testMouse: testMouse,
	};
};
