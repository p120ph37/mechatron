////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Types + Timer Test Module                      //
//                                                                            //
//  Exercises the data-type classes (Range, Point, Size, Bounds, Color,       //
//  Image, Hash) and the Timer class using the modern mechatron API.          //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert) {

	function testTypes() {
		log("  Types... ");

		var Range  = mechatron.Range;
		var Point  = mechatron.Point;
		var Size   = mechatron.Size;
		var Bounds = mechatron.Bounds;
		var Color  = mechatron.Color;
		var Image  = mechatron.Image;

		// Range
		var r = new Range(10, 20);
		assert(r.min === 10 && r.max === 20, "Range ctor");
		assert(r.getRange() === 10, "Range getRange");
		assert(new Range().eq(0), "Range default eq 0");
		assert(new Range(5, 15).ne(new Range(5, 16)), "Range ne");

		// Point
		var p = new Point(5, 10);
		assert(p.x === 5 && p.y === 10, "Point ctor");
		assert(p.eq(new Point(5, 10)), "Point eq");
		assert(p.ne(new Point(5, 11)), "Point ne");
		assert(p.isZero() === false, "Point !isZero");
		assert(new Point().isZero(), "Point default isZero");
		var pa = p.add(new Point(1, 2));
		assert(pa.x === 6 && pa.y === 12, "Point add");
		var ps = p.sub(new Point(1, 2));
		assert(ps.x === 4 && ps.y === 8, "Point sub");
		var pn = p.neg();
		assert(pn.x === -5 && pn.y === -10, "Point neg");

		// Size
		var s = new Size(100, 200);
		assert(s.w === 100 && s.h === 200, "Size ctor");
		assert(s.isZero() === false, "Size !isZero");
		assert(new Size().isZero(), "Size default isZero");
		assert(!s.isEmpty(), "Size !isEmpty");

		// Bounds
		var b = new Bounds(10, 20, 100, 200);
		assert(b.x === 10 && b.y === 20 && b.w === 100 && b.h === 200, "Bounds ctor");
		assert(b.isValid(), "Bounds valid");
		assert(new Bounds().isZero(), "Bounds default isZero");
		assert(b.getPoint().eq(new Point(10, 20)), "Bounds getPoint");
		assert(b.getSize().eq(new Size(100, 200)), "Bounds getSize");
		assert(b.getCenter().x === 60 && b.getCenter().y === 120, "Bounds getCenter");
		assert(b.containsP(50, 50), "Bounds containsP point");
		assert(!b.containsP(0, 0), "Bounds !containsP outside");

		// Color
		var c = new Color(128, 64, 32, 255);
		assert(c.r === 128 && c.g === 64 && c.b === 32 && c.a === 255, "Color ctor");
		assert(c.eq(new Color(128, 64, 32, 255)), "Color eq");
		assert(c.ne(new Color(0, 0, 0, 0)), "Color ne");

		// Image
		var img = new Image(10, 10);
		assert(img.isValid(), "Image valid");
		assert(img.getWidth() === 10, "Image width");
		assert(img.getHeight() === 10, "Image height");
		assert(img.getLength() === 100, "Image length");

		img.setPixel(0, 0, new Color(255, 0, 0, 255));
		var px = img.getPixel(0, 0);
		assert(px.r === 255 && px.g === 0 && px.b === 0, "Image pixel set/get");

		img.fill(100, 200, 50);
		px = img.getPixel(5, 5);
		assert(px.r === 100 && px.g === 200 && px.b === 50, "Image fill");

		// Image create/destroy
		var img2 = new Image();
		assert(!img2.isValid(), "Image default invalid");
		img2.create(5, 5);
		assert(img2.isValid(), "Image create valid");
		img2.destroy();
		assert(!img2.isValid(), "Image destroy invalid");

		// Hash
		var Hash = mechatron.Hash;
		var h1 = new Hash();
		var h2 = new Hash();
		assert(h1.result === h2.result, "Hash default eq");
		h1.append(42);
		assert(h1.result !== h2.result, "Hash append changes result");

		log("OK\n");
		return true;
	}

	function testTimer() {
		log("  Timer... ");

		var Timer = mechatron.Timer;

		// Default construction (not started)
		var t = new Timer();
		assert(typeof t.getElapsed() === "number", "Timer elapsed is number");
		assert(!t.hasStarted(), "Timer default !hasStarted");
		assert(t.getElapsed() === 0, "Timer default elapsed 0");

		// Start and measure
		t.start();
		assert(t.hasStarted(), "Timer hasStarted after start");
		Timer.sleep(50);
		var elapsed = t.getElapsed();
		assert(elapsed >= 40, "Timer sleep ~50ms: got " + elapsed);

		// Reset
		t.reset();
		assert(!t.hasStarted(), "Timer !hasStarted after reset");
		assert(t.getElapsed() === 0, "Timer elapsed 0 after reset");

		// Restart
		t.start();
		Timer.sleep(10);
		var restarted = t.restart();
		assert(restarted >= 5, "Timer restart returns elapsed");
		assert(t.hasStarted(), "Timer hasStarted after restart");

		// hasExpired
		t.start();
		assert(!t.hasExpired(999999), "Timer !hasExpired large");

		// Clone
		var t2 = t.clone();
		assert(t2.hasStarted(), "cloned timer hasStarted");
		assert(t.eq(t2), "cloned timer eq");

		// Comparison
		Timer.sleep(10);
		var t3 = new Timer();
		t3.start();
		assert(t.lt(t3) === false, "earlier timer !lt later");
		assert(t.gt(t3) === true, "earlier timer gt later");

		// Static getCpuTime
		var c1 = Timer.getCpuTime();
		Timer.sleep(10);
		var c2 = Timer.getCpuTime();
		assert(c2 > c1, "getCpuTime monotonic");

		log("OK\n");
		return true;
	}

	return {
		testTypes: testTypes,
		testTimer: testTimer,
	};
};
