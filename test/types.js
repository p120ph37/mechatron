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

		// Range setRange overloads
		var rs = new Range();
		rs.setRange(5, 15);
		assert(rs.min === 5 && rs.max === 15, "Range setRange(min,max)");
		rs.setRange(new Range(1, 2));
		assert(rs.min === 1 && rs.max === 2, "Range setRange(Range)");
		rs.setRange(7);
		assert(rs.min === 7 && rs.max === 7, "Range setRange(value)");
		rs.setRange({ min: 3, max: 9 });
		assert(rs.min === 3 && rs.max === 9, "Range setRange(obj)");

		// Range contains
		var rc = new Range(10, 20);
		assert(rc.contains(15), "Range contains(15) inclusive");
		assert(rc.contains(10), "Range contains(10) inclusive boundary");
		assert(rc.contains(20), "Range contains(20) inclusive boundary");
		assert(!rc.contains(9), "Range !contains(9)");
		assert(!rc.contains(21), "Range !contains(21)");
		assert(!rc.contains(10, false), "Range !contains(10) exclusive");
		assert(rc.contains(15, false), "Range contains(15) exclusive");

		// Range getRandom
		var rr = new Range(100, 200);
		var rand = rr.getRandom();
		assert(rand >= 100 && rand < 200, "Range getRandom in range");
		// min >= max returns min
		var rr2 = new Range(5, 5);
		assert(rr2.getRandom() === 5, "Range getRandom min=max");

		// Range constructor overloads
		var rObj = new Range({ min: 11, max: 22 });
		assert(rObj.min === 11 && rObj.max === 22, "Range ctor obj");
		var rVal = new Range(42);
		assert(rVal.min === 42 && rVal.max === 42, "Range ctor single value");

		// Range eq with object and two numbers
		assert(rc.eq({ min: 10, max: 20 }), "Range eq obj");
		assert(rc.eq(10, 20), "Range eq(min,max)");

		// Range ne
		assert(rc.ne({ min: 1, max: 2 }), "Range ne obj");

		// Range eq TypeError
		var rThrew = false;
		try { rc.eq("bad"); } catch(e) { rThrew = true; }
		assert(rThrew, "Range eq invalid throws");

		// Range toString
		assert(rc.toString() === "[10, 20]", "Range toString");

		// Range clone, normalize
		var rc2 = rc.clone();
		assert(rc2.eq(rc), "Range clone eq");
		var rn = Range.normalize(3, 7);
		assert(rn.min === 3 && rn.max === 7, "Range normalize");
		var rn2 = Range.normalize(new Range(1, 2));
		assert(rn2.min === 1 && rn2.max === 2, "Range normalize(Range)");
		var rn3 = Range.normalize({ min: 4, max: 8 });
		assert(rn3.min === 4 && rn3.max === 8, "Range normalize(obj)");
		var rn4 = Range.normalize(5);
		assert(rn4.min === 5 && rn4.max === 5, "Range normalize(number)");
		var rn5 = Range.normalize();
		assert(rn5.min === 0 && rn5.max === 0, "Range normalize()");

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

		// Point constructor overloads
		var pObj = new Point({ x: 3, y: 7 });
		assert(pObj.x === 3 && pObj.y === 7, "Point ctor obj");
		var pVal = new Point(42);
		assert(pVal.x === 42 && pVal.y === 42, "Point ctor single value");

		// Point eq with object and two numbers
		assert(p.eq({ x: 5, y: 10 }), "Point eq obj");
		assert(p.eq(5, 10), "Point eq(x,y)");

		// Point ne with different types
		assert(p.ne({ x: 1, y: 2 }), "Point ne obj");

		// Point eq single number (x===a && y===a)
		var pSame = new Point(7, 7);
		assert(pSame.eq(7), "Point eq single number");
		// Point eq TypeError
		var ptThrew = false;
		try { p.eq("bad"); } catch(e) { ptThrew = true; }
		assert(ptThrew, "Point eq invalid throws");
		// Point add/sub with plain object and single number
		var paObj = p.add({ x: 1, y: 2 });
		assert(paObj.x === 6 && paObj.y === 12, "Point add obj");
		var psNum = p.sub(1);
		assert(psNum.x === 4 && psNum.y === 9, "Point sub number");
		// Point toString
		assert(p.toString() === "[5, 10]", "Point toString");

		// Point toSize, clone, normalize
		var pts = p.toSize();
		assert(pts.w === 5 && pts.h === 10, "Point toSize");
		var pc = p.clone();
		assert(pc.eq(p), "Point clone eq");
		var pnorm = Point.normalize(3, 7);
		assert(pnorm.x === 3 && pnorm.y === 7, "Point normalize(x,y)");
		var pnorm2 = Point.normalize(new Point(1, 2));
		assert(pnorm2.x === 1 && pnorm2.y === 2, "Point normalize(Point)");
		var pnorm3 = Point.normalize({ x: 4, y: 8 });
		assert(pnorm3.x === 4 && pnorm3.y === 8, "Point normalize(obj)");
		var pnorm4 = Point.normalize(5);
		assert(pnorm4.x === 5 && pnorm4.y === 5, "Point normalize(number)");
		var pnorm5 = Point.normalize();
		assert(pnorm5.x === 0 && pnorm5.y === 0, "Point normalize()");

		// Point add/sub with undefined (hits _resolve default branch)
		var pDef = p.add();
		assert(pDef.x === 5 && pDef.y === 10, "Point add() default");
		var psDef = p.sub();
		assert(psDef.x === 5 && psDef.y === 10, "Point sub() default");

		// Size
		var s = new Size(100, 200);
		assert(s.w === 100 && s.h === 200, "Size ctor");
		assert(s.isZero() === false, "Size !isZero");
		assert(new Size().isZero(), "Size default isZero");
		assert(!s.isEmpty(), "Size !isEmpty");
		assert(new Size(0, 5).isEmpty(), "Size isEmpty w=0");
		assert(new Size(5, 0).isEmpty(), "Size isEmpty h=0");

		// Size constructor overloads
		var sObj = new Size({ w: 3, h: 7 });
		assert(sObj.w === 3 && sObj.h === 7, "Size ctor obj");
		var sVal = new Size(42);
		assert(sVal.w === 42 && sVal.h === 42, "Size ctor single value");

		// Size eq with object and two numbers
		assert(s.eq({ w: 100, h: 200 }), "Size eq obj");
		assert(s.eq(100, 200), "Size eq(w,h)");
		assert(new Size(5, 5).eq(5), "Size eq single number");

		// Size ne
		assert(s.ne({ w: 1, h: 2 }), "Size ne obj");
		assert(s.ne(1, 2), "Size ne(w,h)");

		// Size eq TypeError
		var szThrew = false;
		try { s.eq("bad"); } catch(e) { szThrew = true; }
		assert(szThrew, "Size eq invalid throws");
		// Size add/sub with plain object and single number
		var saObj = s.add({ w: 5, h: 10 });
		assert(saObj.w === 105 && saObj.h === 210, "Size add obj");
		var ssNum = s.sub(10);
		assert(ssNum.w === 90 && ssNum.h === 190, "Size sub number");
		// Size toString
		assert(s.toString() === "[100, 200]", "Size toString");

		// Size toPoint, add, sub, clone, normalize
		var sp = s.toPoint();
		assert(sp.x === 100 && sp.y === 200, "Size toPoint");
		var sa = s.add(new Size(10, 20));
		assert(sa.w === 110 && sa.h === 220, "Size add");
		var ss = s.sub(new Size(10, 20));
		assert(ss.w === 90 && ss.h === 180, "Size sub");
		var scl = s.clone();
		assert(scl.eq(s), "Size clone eq");
		var snorm = Size.normalize(50, 60);
		assert(snorm.w === 50 && snorm.h === 60, "Size normalize(w,h)");
		var snorm2 = Size.normalize(new Size(1, 2));
		assert(snorm2.w === 1 && snorm2.h === 2, "Size normalize(Size)");
		var snorm3 = Size.normalize({ w: 3, h: 4 });
		assert(snorm3.w === 3 && snorm3.h === 4, "Size normalize(obj)");
		var snorm4 = Size.normalize(7);
		assert(snorm4.w === 7 && snorm4.h === 7, "Size normalize(number)");
		var snorm5 = Size.normalize();
		assert(snorm5.w === 0 && snorm5.h === 0, "Size normalize()");

		// Size add/sub with undefined (hits _resolve default branch)
		var saDef = s.add();
		assert(saDef.w === 100 && saDef.h === 200, "Size add() default");
		var ssDef = s.sub();
		assert(ssDef.w === 100 && ssDef.h === 200, "Size sub() default");

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

		// Bounds LTRB
		assert(b.getLeft() === 10, "Bounds getLeft");
		assert(b.getTop() === 20, "Bounds getTop");
		assert(b.getRight() === 110, "Bounds getRight");
		assert(b.getBottom() === 220, "Bounds getBottom");
		var ltrb = b.getLTRB();
		assert(ltrb.l === 10 && ltrb.t === 20 && ltrb.r === 110 && ltrb.b === 220, "Bounds getLTRB");

		// Bounds setLeft/Top/Right/Bottom
		var bs = new Bounds(10, 20, 100, 200);
		bs.setLeft(5);
		assert(bs.x === 5, "Bounds setLeft");
		bs.setTop(15);
		assert(bs.y === 15, "Bounds setTop");
		bs.setRight(200);
		assert(bs.w === 195, "Bounds setRight");
		bs.setBottom(300);
		assert(bs.h === 285, "Bounds setBottom");

		// Bounds setLTRB
		var bs2 = new Bounds();
		bs2.setLTRB(10, 20, 110, 220);
		assert(bs2.x === 10 && bs2.y === 20 && bs2.w === 100 && bs2.h === 200, "Bounds setLTRB");

		// Bounds setLTRB TypeError
		boundsThrew = false;
		try { bs2.setLTRB("a", 1, 2, 3); } catch(e) { boundsThrew = true; }
		assert(boundsThrew, "Bounds setLTRB invalid throws");

		// Bounds setPoint/setSize
		var bs3 = new Bounds(10, 20, 100, 200);
		bs3.setPoint(new Point(5, 15));
		assert(bs3.x === 5 && bs3.y === 15, "Bounds setPoint");
		bs3.setSize(new Size(50, 60));
		assert(bs3.w === 50 && bs3.h === 60, "Bounds setSize");

		// Bounds normalize (negative dimensions)
		var bn = new Bounds(100, 200, -50, -60);
		bn.normalize();
		assert(bn.x === 50 && bn.y === 140 && bn.w === 50 && bn.h === 60, "Bounds normalize");

		// Bounds containsB
		var outer = new Bounds(0, 0, 100, 100);
		var inner = new Bounds(10, 10, 50, 50);
		assert(outer.containsB(inner), "Bounds containsB inner");
		assert(!inner.containsB(outer), "Bounds !containsB outer");

		// Bounds intersects
		var b1 = new Bounds(0, 0, 100, 100);
		var b2 = new Bounds(50, 50, 100, 100);
		assert(b1.intersects(b2), "Bounds intersects overlap");
		var b3 = new Bounds(200, 200, 50, 50);
		assert(!b1.intersects(b3), "Bounds !intersects disjoint");

		// Bounds unite
		var u = b1.unite(b2);
		assert(u.x === 0 && u.y === 0 && u.w === 150 && u.h === 150, "Bounds unite");

		// Bounds intersect
		var ix = b1.intersect(b2);
		assert(ix.x === 50 && ix.y === 50 && ix.w === 50 && ix.h === 50, "Bounds intersect");
		var ix2 = b1.intersect(b3);
		assert(ix2.isZero(), "Bounds intersect disjoint -> zero");

		// Bounds clone
		var bcl = b.clone();
		assert(bcl.eq(b), "Bounds clone eq");

		// Bounds from {x,y,w,h} object (constructor)
		var bObj = new Bounds({ x: 10, y: 20, w: 100, h: 200 });
		assert(bObj.x === 10 && bObj.y === 20 && bObj.w === 100 && bObj.h === 200, "Bounds ctor {x,y,w,h} obj");

		// Bounds from LTRB object
		var blt = new Bounds({ l: 10, t: 20, r: 110, b: 220 });
		assert(blt.x === 10 && blt.y === 20 && blt.w === 100 && blt.h === 200, "Bounds ctor LTRB obj");

		// Bounds from Point+Size
		var bps = new Bounds(new Point(5, 10), new Size(50, 60));
		assert(bps.x === 5 && bps.y === 10 && bps.w === 50 && bps.h === 60, "Bounds ctor Point+Size");

		// Bounds from plain objects (Point-like + Size-like)
		var bPlain = new Bounds({ x: 1, y: 2 }, { w: 30, h: 40 });
		assert(bPlain.x === 1 && bPlain.y === 2 && bPlain.w === 30 && bPlain.h === 40, "Bounds ctor plain obj pair");

		// Bounds from single number
		var bNum = new Bounds(5);
		assert(bNum.x === 5 && bNum.y === 5 && bNum.w === 5 && bNum.h === 5, "Bounds ctor single number");

		// Bounds from two numbers
		var bTwo = new Bounds(3, 7);
		assert(bTwo.x === 3 && bTwo.y === 3 && bTwo.w === 7 && bTwo.h === 7, "Bounds ctor two numbers");

		// Bounds static normalize
		var bnorm = Bounds.normalize(1, 2, 3, 4);
		assert(bnorm.x === 1 && bnorm.y === 2 && bnorm.w === 3 && bnorm.h === 4, "Bounds normalize static");

		// Bounds _resolveArgs/validateArgs: {x,y,w,h} object
		assert(b.eq({ x: 10, y: 20, w: 100, h: 200 }), "Bounds eq {x,y,w,h} obj");
		// Bounds _resolveArgs: {l,t,r,b} object
		assert(b.eq({ l: 10, t: 20, r: 110, b: 220 }), "Bounds eq {l,t,r,b} obj");
		// Bounds _resolveArgs: (Point-like, Size-like) pair
		assert(b.eq({ x: 10, y: 20 }, { w: 100, h: 200 }), "Bounds eq (Point,Size) pair");
		// Bounds ne with object
		assert(b.ne({ x: 1, y: 2, w: 3, h: 4 }), "Bounds ne obj");
		// Bounds _resolveArgs: single number
		var bsn = Bounds.normalize(5);
		assert(bsn.x === 5 && bsn.y === 5 && bsn.w === 5 && bsn.h === 5, "Bounds normalize(number)");
		// Bounds _resolveArgs: default (no args)
		var bsd = Bounds.normalize();
		assert(bsd.x === 0 && bsd.y === 0 && bsd.w === 0 && bsd.h === 0, "Bounds normalize()");
		// Bounds _validateArgs: TypeError for string
		var boundsThrew = false;
		try { b.eq("invalid"); } catch(e) { boundsThrew = true; }
		assert(boundsThrew, "Bounds eq string throws TypeError");
		// Bounds _validateArgs: TypeError for invalid object
		boundsThrew = false;
		try { b.eq({ z: 1 }); } catch(e) { boundsThrew = true; }
		assert(boundsThrew, "Bounds eq invalid obj throws TypeError");
		// Bounds _validateArgs: TypeError for non-number non-object
		boundsThrew = false;
		try { b.eq(true); } catch(e) { boundsThrew = true; }
		assert(boundsThrew, "Bounds eq bool throws TypeError");
		// Bounds toString
		assert(b.toString() === "[10, 20, 100, 200]", "Bounds toString");
		// Bounds containsB with {x,y,w,h} object
		assert(outer.containsB({ x: 10, y: 10, w: 50, h: 50 }), "Bounds containsB obj");
		// Bounds intersects with {l,t,r,b} object
		assert(b1.intersects({ l: 50, t: 50, r: 150, b: 150 }), "Bounds intersects ltrb obj");

		// Bounds containsP TypeError
		boundsThrew = false;
		try { b.containsP("bad"); } catch(e) { boundsThrew = true; }
		assert(boundsThrew, "Bounds containsP string throws");

		// Bounds setPoint TypeError
		boundsThrew = false;
		try { bs3.setPoint("bad"); } catch(e) { boundsThrew = true; }
		assert(boundsThrew, "Bounds setPoint string throws");

		// Bounds setSize TypeError
		boundsThrew = false;
		try { bs3.setSize("bad"); } catch(e) { boundsThrew = true; }
		assert(boundsThrew, "Bounds setSize string throws");

		// Bounds unite with empty bounds
		var emptyB = new Bounds();
		var uRes = emptyB.unite(b1);
		assert(uRes.eq(b1), "Bounds unite empty+b1 = b1");
		var uRes2 = b1.unite(emptyB);
		assert(uRes2.eq(b1), "Bounds unite b1+empty = b1");

		// Color
		var c = new Color(128, 64, 32, 255);
		assert(c.r === 128 && c.g === 64 && c.b === 32 && c.a === 255, "Color ctor");
		assert(c.eq(new Color(128, 64, 32, 255)), "Color eq");
		assert(c.ne(new Color(0, 0, 0, 0)), "Color ne");

		// Color ARGB
		var argb = c.getARGB();
		assert(typeof argb === "number", "Color getARGB number");
		var c2 = new Color();
		c2.setARGB(argb);
		assert(c2.r === 128 && c2.g === 64 && c2.b === 32 && c2.a === 255, "Color setARGB round-trip");

		// Color from single ARGB number
		var c3 = new Color(argb);
		assert(c3.r === 128 && c3.g === 64 && c3.b === 32 && c3.a === 255, "Color ctor ARGB number");

		// Color from object
		var c4 = new Color({ r: 10, g: 20, b: 30 });
		assert(c4.r === 10 && c4.g === 20 && c4.b === 30 && c4.a === 255, "Color ctor obj default a");

		// Color toString
		assert(typeof c.toString() === "string", "Color toString");
		assert(c.toString() === "[128, 64, 32, 255]", "Color toString value");

		// Color eq with object
		assert(c.eq({ r: 128, g: 64, b: 32, a: 255 }), "Color eq obj");
		// Color eq with ARGB number
		assert(c.eq(argb), "Color eq ARGB number");
		// Color ne with object
		assert(c.ne({ r: 0, g: 0, b: 0, a: 0 }), "Color ne obj");

		// Color eq TypeError
		var colThrew = false;
		try { c.eq("bad"); } catch(e) { colThrew = true; }
		assert(colThrew, "Color eq invalid throws");

		// Color clone, normalize
		var ccl = c.clone();
		assert(ccl.eq(c), "Color clone eq");
		var cnorm = Color.normalize(100, 200, 50, 128);
		assert(cnorm.r === 100 && cnorm.g === 200 && cnorm.b === 50 && cnorm.a === 128, "Color normalize");

		// Image
		var img = new Image(10, 10);
		assert(img.isValid(), "Image valid");
		assert(img.getWidth() === 10, "Image width");
		assert(img.getHeight() === 10, "Image height");
		assert(img.getLength() === 100, "Image length");
		assert(img.getLimit() >= 100, "Image limit >= length");

		img.setPixel(0, 0, new Color(255, 0, 0, 255));
		var px = img.getPixel(0, 0);
		assert(px.r === 255 && px.g === 0 && px.b === 0, "Image pixel set/get");

		// Image setPixel/getPixel with Point
		img.setPixel(new Point(1, 1), new Color(0, 255, 0, 255));
		px = img.getPixel(new Point(1, 1));
		assert(px.g === 255 && px.r === 0, "Image pixel Point set/get");

		img.fill(100, 200, 50);
		px = img.getPixel(5, 5);
		assert(px.r === 100 && px.g === 200 && px.b === 50, "Image fill");

		// Image getData
		var data = img.getData();
		assert(data !== null && data.length === 100, "Image getData");

		// Image eq/ne
		var imgA = new Image(4, 4);
		imgA.fill(255, 0, 0);
		var imgB = new Image(4, 4);
		imgB.fill(255, 0, 0);
		assert(imgA.eq(imgB), "Image eq same content");
		imgB.setPixel(0, 0, new Color(0, 0, 0, 255));
		assert(imgA.ne(imgB), "Image ne different content");

		// Image swap channels
		var imgS = new Image(2, 2);
		imgS.fill(10, 20, 30, 40);
		var swapped = imgS.swap("ABGR");
		assert(swapped === true, "Image swap ABGR");
		var pxS = imgS.getPixel(0, 0);
		assert(pxS.r === 30 && pxS.g === 20 && pxS.b === 10, "Image swap pixel values");
		assert(imgS.swap("XX") === false, "Image swap invalid returns false");

		// Image flip
		var imgF = new Image(3, 1);
		imgF.setPixel(0, 0, new Color(255, 0, 0, 255));
		imgF.setPixel(1, 0, new Color(0, 255, 0, 255));
		imgF.setPixel(2, 0, new Color(0, 0, 255, 255));
		imgF.flip(true, false);
		assert(imgF.getPixel(0, 0).b === 255 && imgF.getPixel(2, 0).r === 255, "Image flipH");
		imgF.flip(false, true);
		assert(imgF.getPixel(0, 0).b === 255, "Image flipV (1 row no-op)");
		imgF.flip(true, true);
		assert(imgF.getPixel(0, 0).r === 255, "Image flipBoth");

		// Image single-index getPixel/setPixel (diagonal access)
		var imgIdx = new Image(5, 5);
		imgIdx.fill(0, 0, 0, 255);
		imgIdx.setPixel(2, new Color(99, 88, 77, 255));
		var pxIdx = imgIdx.getPixel(2);
		assert(pxIdx.r === 99 && pxIdx.g === 88 && pxIdx.b === 77, "Image single-index get/set");

		// Image fill TypeError for invalid object
		var fillThrew = false;
		try { img.fill({ z: 1 }); } catch(e) { fillThrew = true; }
		assert(fillThrew, "Image fill invalid obj throws");
		fillThrew = false;
		try { img.fill("red"); } catch(e) { fillThrew = true; }
		assert(fillThrew, "Image fill string throws");

		// Image flipV with multi-row image
		var imgFV = new Image(2, 3);
		imgFV.setPixel(0, 0, new Color(255, 0, 0, 255));
		imgFV.setPixel(1, 0, new Color(255, 0, 0, 255));
		imgFV.setPixel(0, 2, new Color(0, 0, 255, 255));
		imgFV.setPixel(1, 2, new Color(0, 0, 255, 255));
		imgFV.flip(false, true);
		assert(imgFV.getPixel(0, 0).b === 255, "Image flipV top row now blue");
		assert(imgFV.getPixel(0, 2).r === 255, "Image flipV bottom row now red");

		// Image toString
		assert(typeof img.toString() === "string", "Image toString");

		// Image clone
		var imgCl = img.clone();
		assert(imgCl.eq(img), "Image clone eq");

		// Image single-number constructor (creates square image)
		var imgSq = new Image(3);
		assert(imgSq.isValid(), "Image single-number ctor valid");
		assert(imgSq.getWidth() === 3 && imgSq.getHeight() === 3, "Image single-number 3x3");

		// Image create with Size object
		var imgSz = new Image();
		var createRes = imgSz.create(new Size(4, 5));
		assert(createRes === true, "Image create(Size) returns true");
		assert(imgSz.getWidth() === 4 && imgSz.getHeight() === 5, "Image create(Size) dims");

		// Image create with single number (square)
		var imgSq2 = new Image();
		imgSq2.create(6);
		assert(imgSq2.getWidth() === 6 && imgSq2.getHeight() === 6, "Image create(number) square");

		// Image setPixel TypeError
		var setPixThrew = false;
		try { img.setPixel(true, new Color()); } catch(e) { setPixThrew = true; }
		assert(setPixThrew, "Image setPixel invalid throws");

		// Image create TypeError
		var createThrew = false;
		try { img.create("bad"); } catch(e) { createThrew = true; }
		assert(createThrew, "Image create invalid throws");

		// Image getPixel TypeError
		var getPixThrew = false;
		try { img.getPixel("bad"); } catch(e) { getPixThrew = true; }
		assert(getPixThrew, "Image getPixel invalid throws");

		// Image create/destroy
		var img2 = new Image();
		assert(!img2.isValid(), "Image default invalid");
		img2.create(5, 5);
		assert(img2.isValid(), "Image create valid");
		img2.destroy();
		assert(!img2.isValid(), "Image destroy invalid");

		// Image copy constructor
		var imgOrig = new Image(3, 3);
		imgOrig.fill(77, 88, 99);
		var imgCopy = new Image(imgOrig);
		assert(imgCopy.eq(imgOrig), "Image copy ctor eq");

		// Hash
		var Hash = mechatron.Hash;
		var h1 = new Hash();
		var h2 = new Hash();
		assert(h1.result === h2.result, "Hash default eq");
		h1.append(42);
		assert(h1.result !== h2.result, "Hash append changes result");

		// Hash ne, clone
		assert(h1.ne(h2), "Hash ne");
		assert(h1.ne(0), "Hash ne number");
		var hc = h1.clone();
		assert(hc.eq(h1), "Hash clone eq");
		assert(!hc.ne(h1), "Hash clone !ne");

		// Hash append with different types
		var h3 = new Hash();
		h3.append("hello");
		assert(h3.result !== 0, "Hash append string");
		var h4 = new Hash();
		h4.append(Buffer.from([1, 2, 3]));
		assert(h4.result !== 0, "Hash append Buffer");
		var h5 = new Hash();
		h5.append(new Uint8Array([10, 20, 30]));
		assert(h5.result !== 0, "Hash append Uint8Array");
		var h6 = new Hash();
		h6.append([5, 6, 7]);
		assert(h6.result !== 0, "Hash append Array");

		// Hash constructor with data
		var h7 = new Hash("test");
		assert(h7.result !== 0, "Hash ctor with string");
		var h8 = new Hash(h7);
		assert(h8.eq(h7), "Hash copy ctor");

		// Hash constructor with number
		var h9 = new Hash(12345);
		assert(h9.result === 12345, "Hash ctor number");

		// Hash append with ArrayBuffer
		var h10 = new Hash();
		h10.append(new ArrayBuffer(4));
		assert(typeof h10.result === "number", "Hash append ArrayBuffer");

		// Hash ne TypeError
		var hashThrew = false;
		try { h1.ne("invalid"); } catch(e) { hashThrew = true; }
		assert(hashThrew, "Hash ne invalid throws");
		hashThrew = false;
		try { h1.eq("invalid"); } catch(e) { hashThrew = true; }
		assert(hashThrew, "Hash eq invalid throws");

		// Hash toString
		var hStr = h1.toString();
		assert(hStr.indexOf("0x") === 0, "Hash toString starts with 0x");
		assert(hStr.length === 10, "Hash toString length 10");

		// Hash append with object that has Symbol.toPrimitive
		var hPrim = new Hash();
		var primObj = {};
		primObj[Symbol.toPrimitive] = function() { return "prim"; };
		hPrim.append(primObj);
		assert(hPrim.result !== 0, "Hash append toPrimitive obj");

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

		// hasExpired with 0 (need some time to have passed)
		Timer.sleep(1);
		assert(t.hasExpired(0), "Timer hasExpired(0)");

		// ne
		Timer.sleep(5);
		var tn = new Timer();
		tn.start();
		assert(t.ne(tn), "Timer ne different start");

		// Comparison
		Timer.sleep(10);
		var t3 = new Timer();
		t3.start();
		assert(t.lt(t3) === false, "earlier timer !lt later");
		assert(t.gt(t3) === true, "earlier timer gt later");
		assert(t.le(t3) === false, "earlier timer !le later");
		assert(t.ge(t3) === true, "earlier timer ge later");

		// Static compare (including equal)
		assert(Timer.compare(t, t3) > 0, "Timer.compare earlier>later");
		var teq1 = new Timer();
		teq1.start();
		var teq2 = teq1.clone();
		assert(Timer.compare(teq1, teq2) === 0, "Timer.compare equal");

		// Restart on non-started timer
		var tns = new Timer();
		assert(tns.restart() === 0, "Timer restart non-started returns 0");

		// Timer.sleep with min,max numbers
		Timer.sleep(1, 5);

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
