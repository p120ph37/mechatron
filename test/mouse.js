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

	function testMouse() {
		log("  Mouse... ");

		var Mouse = mechatron.Mouse;
		var m = new Mouse();

		// --- setPos / getPos round-trip ---
		var old = Mouse.getPos();
		assert(typeof old.x === "number" && typeof old.y === "number", "getPos returns point");

		// Probe setPos
		Mouse.setPos(100, 200);
		mechatron.Timer.sleep(10);
		var p = Mouse.getPos();
		var mousePosWorks = (p.x === 100 && p.y === 200);
		if (mousePosWorks) {
			Mouse.setPos(50, 50);
			p = Mouse.getPos();
			assert(p.x === 50 && p.y === 50, "setPos 50,50: got " + p.x + "," + p.y);
			Mouse.setPos(old);
		} else {
			expectOrSkip("mousePos", "Mouse setPos");
			log("(setPos unavailable) ");
		}

		// Probe mouse button simulation
		m.press(mechatron.BUTTON_LEFT);
		var mousePressWorks = waitFor(function () {
			return Mouse.getState(mechatron.BUTTON_LEFT) === true;
		}, 200);
		m.release(mechatron.BUTTON_LEFT);
		var mouseReleaseWorks = mousePressWorks && waitFor(function () {
			return Mouse.getState(mechatron.BUTTON_LEFT) === false;
		}, 200);
		if (mouseReleaseWorks) {
			m.click(mechatron.BUTTON_RIGHT);
			mouseReleaseWorks = waitFor(function () {
				return Mouse.getState(mechatron.BUTTON_RIGHT) === false;
			}, 200);
		}
		if (mouseReleaseWorks) {
			m.press(mechatron.BUTTON_MID);
			assert(waitFor(function () {
				return Mouse.getState(mechatron.BUTTON_MID) === true;
			}, 200), "mid pressed in state");
			var bState = Mouse.getState();
			assert(typeof bState === "object", "getState returns object");
			assert(bState[mechatron.BUTTON_MID] === true, "mid pressed in state obj");
			m.release(mechatron.BUTTON_MID);

			m.click(mechatron.BUTTON_LEFT);
			assert(waitFor(function () {
				return Mouse.getState(mechatron.BUTTON_LEFT) === false;
			}, 200), "left released after click");
		} else {
			expectOrSkip("mouseSim", "Mouse input simulation");
			log("(input sim unavailable) ");
			var bState = Mouse.getState();
			assert(typeof bState === "object", "getState returns object");
		}

		// --- scroll (verify no crash) ---
		m.scrollV(1);
		m.scrollV(-1);
		m.scrollH(1);
		m.scrollH(-1);

		// --- X1 / X2 buttons (extra mouse buttons) ---
		// Exercise the BUTTON_X1/X2 branches in press/release/getButtonState.
		// On Linux these are unsupported (XTest has no X1/X2) and getButtonState
		// returns false unconditionally — that's still the branch we want to
		// hit.  On Windows/macOS these go through the full event-post path.
		m.press(mechatron.BUTTON_X1);
		m.release(mechatron.BUTTON_X1);
		m.press(mechatron.BUTTON_X2);
		m.release(mechatron.BUTTON_X2);
		assert(typeof Mouse.getState(mechatron.BUTTON_X1) === "boolean", "BUTTON_X1 getState bool");
		assert(typeof Mouse.getState(mechatron.BUTTON_X2) === "boolean", "BUTTON_X2 getState bool");

		// --- Out-of-range button (default branch) ---
		// The FFI backend's switch statements have a default `return null/false`
		// arm for unknown button numbers; press/release/getState should all
		// no-op or return false without throwing.
		m.press(99);
		m.release(99);
		assert(Mouse.getState(99) === false, "unknown button getState=false");

		// --- Multi-step scroll (exercises the repeat loop on Linux) ---
		m.scrollV(3);
		m.scrollV(-3);
		m.scrollH(2);
		m.scrollH(-2);

		// --- autoDelay ---
		assert(m.autoDelay instanceof mechatron.Range, "autoDelay is Range");

		// --- clone ---
		var mc = m.clone();
		assert(mc.autoDelay instanceof mechatron.Range, "clone autoDelay");

		// --- copy constructor ---
		var mCopy = new Mouse(m);
		assert(mCopy.autoDelay instanceof mechatron.Range, "copy ctor autoDelay");

		// --- getState() without button (returns full state object) ---
		var mState = Mouse.getState();
		assert(typeof mState === "object", "getState() returns all buttons");

		log("OK\n");
		return true;
	}

	return {
		testMouse: testMouse,
	};
};
