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

		// --- autoDelay ---
		assert(m.autoDelay instanceof mechatron.Range, "autoDelay is Range");

		// --- clone ---
		var mc = m.clone();
		assert(mc.autoDelay instanceof mechatron.Range, "clone autoDelay");

		log("OK\n");
		return true;
	}

	return {
		testMouse: testMouse,
	};
};
