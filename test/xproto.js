////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron xproto Test Module                            //
//                                                                            //
//  Pure-TS exercises of lib/x11proto/wire.ts: DISPLAY parsing, Xauthority    //
//  record decoding, connection setup request encoding, connection setup      //
//  reply parsing.  No live X server required — the reply parser is           //
//  exercised against hand-rolled byte blobs with the layout from the X11     //
//  protocol spec.                                                            //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip) {

	function testXproto() {
		log("  xproto... ");
		var wire = require("../lib/x11proto/wire");

		// ── parseDisplay ─────────────────────────────────────────────
		var d = wire.parseDisplay(":0");
		assert(d && d.kind === "unix", ":0 → unix");
		assert(d.path === "/tmp/.X11-unix/X0", ":0 path");
		assert(d.display === 0 && d.screen === 0, ":0 numbers");

		d = wire.parseDisplay(":99.2");
		assert(d && d.display === 99 && d.screen === 2, ":99.2 numbers");
		assert(d.path === "/tmp/.X11-unix/X99", ":99.2 path");

		d = wire.parseDisplay("unix:0");
		assert(d && d.kind === "unix" && d.path === "/tmp/.X11-unix/X0", "unix:0 form");

		d = wire.parseDisplay("host:1");
		assert(d && d.kind === "tcp", "host:1 → tcp");
		assert(d.host === "host" && d.port === 6001, "tcp host/port");
		assert(d.display === 1 && d.screen === 0, "tcp defaults screen 0");

		d = wire.parseDisplay("host:1.3");
		assert(d && d.screen === 3, "tcp screen");

		d = wire.parseDisplay("[::1]:0");
		assert(d && d.kind === "tcp" && d.host === "::1", "bracketed IPv6");

		assert(wire.parseDisplay("") === null, "empty → null");
		assert(wire.parseDisplay("no-colon") === null, "no colon → null");
		assert(wire.parseDisplay(":abc") === null, "non-numeric display → null");
		assert(wire.parseDisplay(":-1") === null, "negative display → null");
		assert(wire.parseDisplay(":70000") === null, "over-range display → null");

		// ── parseXauthority ──────────────────────────────────────────
		// Build a single MIT-MAGIC-COOKIE-1 record by hand.
		//   family=256 (LOCAL)
		//   address="hostA"
		//   number="42"
		//   name="MIT-MAGIC-COOKIE-1"
		//   data=16 zero bytes (synthetic cookie)
		function u16be(n) {
			var b = Buffer.alloc(2); b.writeUInt16BE(n, 0); return b;
		}
		function rec(family, addr, num, name, data) {
			return Buffer.concat([
				u16be(family),
				u16be(addr.length), Buffer.from(addr, "utf8"),
				u16be(num.length), Buffer.from(num, "utf8"),
				u16be(name.length), Buffer.from(name, "utf8"),
				u16be(data.length), data,
			]);
		}
		var cookie16 = Buffer.alloc(16); for (var i = 0; i < 16; i++) cookie16[i] = i + 1;
		var xauthBuf = Buffer.concat([
			rec(256, "hostA", "42", "MIT-MAGIC-COOKIE-1", cookie16),
			rec(256, "hostB", "",   "MIT-MAGIC-COOKIE-1", Buffer.alloc(16, 0xAA)),
			rec(65535, "",     "42", "MIT-MAGIC-COOKIE-1", Buffer.alloc(16, 0xBB)),
		]);
		var entries = wire.parseXauthority(xauthBuf);
		assert(entries.length === 3, "3 entries parsed");
		assert(entries[0].family === 256, "entry[0] family");
		assert(entries[0].address.toString("utf8") === "hostA", "entry[0] address");
		assert(entries[0].number === "42", "entry[0] number");
		assert(entries[0].name === "MIT-MAGIC-COOKIE-1", "entry[0] name");
		assert(entries[0].data.equals(cookie16), "entry[0] data");

		// Truncated tail: parser should stop gracefully.
		var trunc = Buffer.concat([xauthBuf, Buffer.from([0, 0])]);
		var truncEntries = wire.parseXauthority(trunc);
		assert(truncEntries.length === 3, "truncated trailing garbage dropped");

		// Malformed: declares more bytes than available.
		var bad = Buffer.concat([u16be(256), u16be(100), Buffer.from("short")]);
		assert(wire.parseXauthority(bad).length === 0, "malformed record produces no entries");

		// ── findXauthCookie ──────────────────────────────────────────
		var epLocal = { kind: "unix", path: "/tmp/.X11-unix/X42", display: 42, screen: 0 };
		var epTcp   = { kind: "tcp", host: "hostA", port: 6042, display: 42, screen: 0 };
		var epOther = { kind: "unix", path: "/tmp/.X11-unix/X7",  display: 7,  screen: 0 };

		var c = wire.findXauthCookie(entries, epLocal, "hostA");
		assert(c && c.data.equals(cookie16), "local match: hostA+42");

		// Host mismatch on LOCAL family → falls through to WILD (entry 3).
		c = wire.findXauthCookie(entries, epLocal, "other-host");
		assert(c && c.data[0] === 0xBB, "WILD fallback on hostname mismatch");

		// Display mismatch → only WILD can match (and only if number="")
		// entry 3 has number="42", so with display 7 none match.
		c = wire.findXauthCookie(entries, epOther, "hostA");
		assert(c === null, "no entry for display 7");

		// TCP endpoint: internet-family cookie (neither in set above → WILD fallback).
		c = wire.findXauthCookie(entries, epTcp, "hostA");
		assert(c && c.data[0] === 0xBB, "TCP falls to WILD (no internet-family entry)");

		// Empty entries list
		assert(wire.findXauthCookie([], epLocal, "hostA") === null, "no entries → null");

		// loadXauthority with missing file → empty, not a throw
		var missing = wire.loadXauthority({ XAUTHORITY: "/nonexistent/xauth", HOME: "/nonexistent" });
		assert(Array.isArray(missing) && missing.length === 0, "missing xauthority → []");

		// ── encodeConnectionSetup ────────────────────────────────────
		var noAuth = wire.encodeConnectionSetup();
		assert(noAuth.length === 12, "no-auth setup is 12 bytes");
		assert(noAuth.readUInt8(0) === 0x6c, "byte-order = 'l'");
		assert(noAuth.readUInt16LE(2) === 11, "major = 11");
		assert(noAuth.readUInt16LE(4) === 0,  "minor = 0");
		assert(noAuth.readUInt16LE(6) === 0,  "auth-name-len = 0");
		assert(noAuth.readUInt16LE(8) === 0,  "auth-data-len = 0");

		var setup = wire.encodeConnectionSetup("MIT-MAGIC-COOKIE-1", cookie16);
		// 12 + pad4(18) + pad4(16) = 12 + 20 + 16 = 48
		assert(setup.length === 48, "authed setup is 48 bytes (got " + setup.length + ")");
		assert(setup.readUInt16LE(6) === 18, "auth-name length");
		assert(setup.readUInt16LE(8) === 16, "auth-data length");
		assert(setup.toString("utf8", 12, 12 + 18) === "MIT-MAGIC-COOKIE-1", "auth name round-trip");
		assert(setup[12 + 18] === 0 && setup[12 + 19] === 0, "auth name padded to 20");
		assert(setup.subarray(32, 48).equals(cookie16), "auth data round-trip");

		// pad4 invariants
		assert(wire.pad4(0) === 0, "pad4(0)");
		assert(wire.pad4(1) === 4, "pad4(1)");
		assert(wire.pad4(4) === 4, "pad4(4)");
		assert(wire.pad4(18) === 20, "pad4(18)");

		// ── parseConnectionSetupReply: failure ───────────────────────
		// byte 0 = 0 (Failed)
		// byte 1 = reason len
		// bytes 2..4 = major, 4..6 = minor, 6..8 = extra length (units of 4)
		// bytes 8.. = reason
		var reason = "Authorization required";
		var reasonPad = (reason.length + 3) & ~3;
		var failExtra = reasonPad / 4;
		var fail = Buffer.alloc(8 + reasonPad);
		fail.writeUInt8(0, 0);                   // Failed
		fail.writeUInt8(reason.length, 1);       // reason length
		fail.writeUInt16LE(11, 2);
		fail.writeUInt16LE(0, 4);
		fail.writeUInt16LE(failExtra, 6);
		fail.write(reason, 8, "utf8");
		assert(wire.connReplyTotalLength(fail) === 8 + reasonPad, "conn reply total (failed)");
		var failed = wire.parseConnectionSetupReply(fail);
		assert(failed.kind === "failed", "failed reply kind");
		assert(failed.reason === reason, "failed reason string");
		assert(failed.major === 11 && failed.minor === 0, "failed version");

		// ── parseConnectionSetupReply: success (minimal 1-screen, 1-depth) ──
		// We hand-craft the smallest valid success blob, verify the walker
		// finds the right fields, and confirm total-length matches.
		var vendor = "FakeX";
		var vendorLen = vendor.length;
		var vendorPad = (vendorLen + 3) & ~3;
		// Pixmap formats: 1 entry (8 bytes)
		// Screens: 1 screen with 1 depth with 1 visual.
		//   screen header 40 + depth header 8 + visual 24 = 72 bytes.
		// Total = 32 (fixed after first 8) + vendorPad + 8 + 72 = 112 + vendorPad
		var extraBytes = 32 + vendorPad + 8 + 72;
		var total = 8 + extraBytes;
		var ok = Buffer.alloc(total);
		ok.writeUInt8(1, 0);                    // Success
		ok.writeUInt8(0, 1);                    // unused
		ok.writeUInt16LE(11, 2);
		ok.writeUInt16LE(0, 4);
		ok.writeUInt16LE(extraBytes / 4, 6);    // extra length in 4-byte units
		ok.writeUInt32LE(12345678, 8);          // releaseNumber
		ok.writeUInt32LE(0x01000000, 12);       // resourceIdBase
		ok.writeUInt32LE(0x001FFFFF, 16);       // resourceIdMask
		ok.writeUInt32LE(256, 20);              // motionBufferSize
		ok.writeUInt16LE(vendorLen, 24);        // vendor length
		ok.writeUInt16LE(0xFFFF, 26);           // maximumRequestLength
		ok.writeUInt8(1, 28);                   // numScreens
		ok.writeUInt8(1, 29);                   // numPixmapFormats
		ok.writeUInt8(0, 30);                   // imageByteOrder (LSB)
		ok.writeUInt8(0, 31);                   // bitmapFormatBitOrder
		ok.writeUInt8(32, 32);                  // bitmapFormatScanlineUnit
		ok.writeUInt8(32, 33);                  // bitmapFormatScanlinePad
		ok.writeUInt8(8, 34);                   // minKeycode
		ok.writeUInt8(255, 35);                 // maxKeycode
		// bytes 36..40: unused
		ok.write(vendor, 40, "utf8");
		var off = 40 + vendorPad;
		// pixmap format @off: depth=24, bpp=32, pad=32, then 5 unused
		ok.writeUInt8(24, off);
		ok.writeUInt8(32, off + 1);
		ok.writeUInt8(32, off + 2);
		off += 8;
		// screen @off: root=0x100, default-colormap=0x101, white=0xFFFFFF, black=0,
		//   input-masks=0, w=1024, h=768, wmm=260, hmm=195,
		//   min/max-installed-maps=1/1, root-visual=0x21, backing-stores=0,
		//   save-unders=0, root-depth=24, num-depths=1
		ok.writeUInt32LE(0x100, off);
		ok.writeUInt32LE(0x101, off + 4);
		ok.writeUInt32LE(0xFFFFFF, off + 8);
		ok.writeUInt32LE(0, off + 12);
		ok.writeUInt32LE(0, off + 16);
		ok.writeUInt16LE(1024, off + 20);
		ok.writeUInt16LE(768, off + 22);
		ok.writeUInt16LE(260, off + 24);
		ok.writeUInt16LE(195, off + 26);
		ok.writeUInt16LE(1, off + 28);
		ok.writeUInt16LE(1, off + 30);
		ok.writeUInt32LE(0x21, off + 32);
		ok.writeUInt8(0, off + 36);
		ok.writeUInt8(0, off + 37);
		ok.writeUInt8(24, off + 38);
		ok.writeUInt8(1, off + 39);
		off += 40;
		// depth @off: depth=24, num-visuals=1
		ok.writeUInt8(24, off);
		ok.writeUInt16LE(1, off + 2);
		off += 8;
		// visual @off: id=0x21, class=4 (TrueColor), bpc=8, entries=256,
		//   redMask=0xFF0000, greenMask=0x00FF00, blueMask=0x0000FF
		ok.writeUInt32LE(0x21, off);
		ok.writeUInt8(4, off + 4);
		ok.writeUInt8(8, off + 5);
		ok.writeUInt16LE(256, off + 6);
		ok.writeUInt32LE(0xFF0000, off + 8);
		ok.writeUInt32LE(0x00FF00, off + 12);
		ok.writeUInt32LE(0x0000FF, off + 16);

		assert(wire.connReplyTotalLength(ok) === total, "conn reply total length");
		var success = wire.parseConnectionSetupReply(ok);
		assert(success.kind === "success", "success kind");
		assert(success.info.vendor === vendor, "vendor round-trips");
		assert(success.info.releaseNumber === 12345678, "releaseNumber");
		assert(success.info.resourceIdBase === 0x01000000, "resourceIdBase");
		assert(success.info.minKeycode === 8 && success.info.maxKeycode === 255, "keycodes");
		assert(success.info.pixmapFormats.length === 1, "1 pixmap format");
		assert(success.info.pixmapFormats[0].depth === 24, "format depth");
		assert(success.info.pixmapFormats[0].bitsPerPixel === 32, "format bpp");
		assert(success.info.screens.length === 1, "1 screen");
		var scr = success.info.screens[0];
		assert(scr.widthPx === 1024 && scr.heightPx === 768, "screen dims");
		assert(scr.root === 0x100, "screen root");
		assert(scr.rootVisual === 0x21, "rootVisual");
		assert(scr.depths.length === 1, "1 depth on screen");
		assert(scr.depths[0].visuals.length === 1, "1 visual on depth 24");
		var vis = scr.depths[0].visuals[0];
		assert(vis.id === 0x21, "visual id");
		assert(vis.class === 4, "visual class (TrueColor)");
		assert(vis.redMask === 0xFF0000 && vis.greenMask === 0xFF00 && vis.blueMask === 0xFF,
			"visual RGB masks");

		// connReplyTotalLength rejects undersized prefix.
		var threw = false;
		try { wire.connReplyTotalLength(Buffer.alloc(4)); } catch (e) { threw = true; }
		assert(threw, "connReplyTotalLength throws on <8-byte prefix");

		// ── request.ts: header helper ────────────────────────────────
		var req = require("../lib/x11proto/request");
		var hdrBuf = Buffer.alloc(8);
		req.writeRequestHeader(hdrBuf, 98, 0);
		assert(hdrBuf.readUInt8(0) === 98, "major opcode");
		assert(hdrBuf.readUInt16LE(2) === 2, "length in 4-byte units");

		var misaligned = false;
		try { req.writeRequestHeader(Buffer.alloc(7), 98, 0); }
		catch (e) { misaligned = true; }
		assert(misaligned, "non-4-aligned buffer rejected");

		// ── encodeQueryExtension ─────────────────────────────────────
		var qeShort = req.encodeQueryExtension("XTEST");
		// pad4(8 + 5) = 16; 4 bytes header + 4 bytes (n, unused) + pad4(5)=8 = 16
		assert(qeShort.length === 16, "QueryExtension 'XTEST' is 16 bytes (got " + qeShort.length + ")");
		assert(qeShort.readUInt8(0) === req.OP_QUERY_EXTENSION, "opcode = 98");
		assert(qeShort.readUInt16LE(2) === 4, "length in 4-byte units");
		assert(qeShort.readUInt16LE(4) === 5, "name length = 5");
		assert(qeShort.toString("utf8", 8, 13) === "XTEST", "name round-trips");
		assert(qeShort[13] === 0 && qeShort[14] === 0 && qeShort[15] === 0, "name padded with NUL");

		// ── parseQueryExtensionReply ─────────────────────────────────
		var qeReply = Buffer.alloc(32);
		qeReply.writeUInt8(1, 0);         // Reply
		qeReply.writeUInt16LE(42, 2);     // seq
		qeReply.writeUInt8(1, 8);         // present
		qeReply.writeUInt8(144, 9);       // majorOpcode
		qeReply.writeUInt8(100, 10);      // firstEvent
		qeReply.writeUInt8(0, 11);        // firstError
		var parsed = req.parseQueryExtensionReply(qeReply);
		assert(parsed.present === true, "parsed present");
		assert(parsed.majorOpcode === 144, "parsed majorOpcode");
		assert(parsed.firstEvent === 100, "parsed firstEvent");
		assert(parsed.firstError === 0, "parsed firstError");

		// Absent extension: present=0, rest zero
		var qeAbs = Buffer.alloc(32);
		qeAbs.writeUInt8(1, 0);
		var parsedAbs = req.parseQueryExtensionReply(qeAbs);
		assert(parsedAbs.present === false, "parsed absent");
		assert(parsedAbs.majorOpcode === 0, "absent majorOpcode = 0");

		var shortThrew = false;
		try { req.parseQueryExtensionReply(Buffer.alloc(16)); }
		catch (e) { shortThrew = true; }
		assert(shortThrew, "parseQueryExtensionReply rejects short buffer");

		// ── parseError ───────────────────────────────────────────────
		var errBuf = Buffer.alloc(32);
		errBuf.writeUInt8(0, 0);           // Error
		errBuf.writeUInt8(req.ERR_VALUE, 1);
		errBuf.writeUInt16LE(7, 2);        // seq
		errBuf.writeUInt32LE(0xDEADBEEF, 4);   // bad value
		errBuf.writeUInt16LE(13, 8);       // minor
		errBuf.writeUInt8(98, 10);         // major (QueryExtension)
		var err = req.parseError(errBuf);
		assert(err.code === req.ERR_VALUE, "error code");
		assert(err.sequence === 7, "error seq");
		assert(err.badValue === 0xDEADBEEF, "bad value");
		assert(err.majorOpcode === 98, "major opcode");
		assert(err.minorOpcode === 13, "minor opcode");

		// ── encodeXTestFakeInput ─────────────────────────────────────
		// XTEST major opcode is per-server; we just verify the byte
		// shape with a stand-in major (132 = a typical assignment).
		var fi = req.encodeXTestFakeInput(132, {
			type: req.XTEST_TYPE_KEY_PRESS, detail: 38, delayMs: 0,
		});
		assert(fi.length === 36, "FakeInput is 36 bytes");
		assert(fi.readUInt8(0) === 132, "major opcode");
		assert(fi.readUInt8(1) === req.XTEST_MINOR_FAKE_INPUT, "minor = 2");
		assert(fi.readUInt16LE(2) === 9, "length = 9 (4-byte units)");
		assert(fi.readUInt8(4) === req.XTEST_TYPE_KEY_PRESS, "type = KeyPress");
		assert(fi.readUInt8(5) === 38, "detail = keycode 38");
		assert(fi.readUInt32LE(8) === 0, "delay = 0");

		var fiMotion = req.encodeXTestFakeInput(132, {
			type: req.XTEST_TYPE_MOTION_NOTIFY, detail: 1,
			rootX: -10, rootY: 200, root: 0x12345678, delayMs: 250,
		});
		assert(fiMotion.readUInt8(4) === req.XTEST_TYPE_MOTION_NOTIFY, "type = Motion");
		assert(fiMotion.readUInt8(5) === 1, "relative flag");
		assert(fiMotion.readUInt32LE(8) === 250, "delay = 250");
		assert(fiMotion.readUInt32LE(12) === 0x12345678, "root window id");
		assert(fiMotion.readInt16LE(24) === -10, "rootX (signed)");
		assert(fiMotion.readInt16LE(26) === 200, "rootY");

		// ── encodeWarpPointer ────────────────────────────────────────
		var wp = req.encodeWarpPointer({
			dstWindow: 0x12345678, dstX: 100, dstY: -50,
		});
		assert(wp.length === 24, "WarpPointer is 24 bytes");
		assert(wp.readUInt8(0) === req.OP_WARP_POINTER, "opcode 41");
		assert(wp.readUInt16LE(2) === 6, "length = 6 (4-byte units)");
		assert(wp.readUInt32LE(4) === 0, "src-window default = None(0)");
		assert(wp.readUInt32LE(8) === 0x12345678, "dst-window");
		assert(wp.readInt16LE(20) === 100, "dst-x");
		assert(wp.readInt16LE(22) === -50, "dst-y (signed)");

		var wp2 = req.encodeWarpPointer({
			srcWindow: 0xAA, dstWindow: 0xBB, srcX: 1, srcY: 2,
			srcW: 100, srcH: 200, dstX: 0, dstY: 0,
		});
		assert(wp2.readUInt32LE(4) === 0xAA, "src-window");
		assert(wp2.readInt16LE(12) === 1 && wp2.readInt16LE(14) === 2, "src-x/y");
		assert(wp2.readUInt16LE(16) === 100 && wp2.readUInt16LE(18) === 200, "src-w/h");

		// ── encodeGetImage / parseGetImageReply ──────────────────────
		var gi = req.encodeGetImage({
			drawable: 0x21F, x: 5, y: -3, width: 100, height: 200,
		});
		assert(gi.length === 20, "GetImage is 20 bytes");
		assert(gi.readUInt8(0) === req.OP_GET_IMAGE, "opcode 73");
		assert(gi.readUInt8(1) === req.IMAGE_FORMAT_Z_PIXMAP, "default = ZPixmap");
		assert(gi.readUInt16LE(2) === 5, "length = 5");
		assert(gi.readUInt32LE(4) === 0x21F, "drawable");
		assert(gi.readInt16LE(8) === 5 && gi.readInt16LE(10) === -3, "x/y signed");
		assert(gi.readUInt16LE(12) === 100 && gi.readUInt16LE(14) === 200, "w/h");
		assert(gi.readUInt32LE(16) === 0xFFFFFFFF, "default plane-mask = all");

		var giReply = Buffer.alloc(32 + 16);  // 4 extra 4-byte units
		giReply.writeUInt8(1, 0);
		giReply.writeUInt8(24, 1);            // depth
		giReply.writeUInt32LE(4, 4);          // 4 * 4 = 16 extra bytes
		giReply.writeUInt32LE(0x21, 8);       // visual id
		for (var bi = 0; bi < 16; bi++) giReply.writeUInt8(0xA0 + bi, 32 + bi);
		var giParsed = req.parseGetImageReply(giReply);
		assert(giParsed.depth === 24, "parsed depth");
		assert(giParsed.visual === 0x21, "parsed visual");
		assert(giParsed.data.length === 16, "parsed data length");
		assert(giParsed.data[0] === 0xA0 && giParsed.data[15] === 0xAF, "parsed data bytes");

		var giShortThrew = false;
		try { req.parseGetImageReply(Buffer.alloc(20)); }
		catch (e) { giShortThrew = true; }
		assert(giShortThrew, "parseGetImageReply rejects short header");

		var giTruncThrew = false;
		var trunc = Buffer.alloc(40);
		trunc.writeUInt8(1, 0);
		trunc.writeUInt32LE(8, 4);   // claims 32 extra bytes but buffer only has 8
		try { req.parseGetImageReply(trunc); }
		catch (e) { giTruncThrew = true; }
		assert(giTruncThrew, "parseGetImageReply rejects truncated body");

		// ── RANDR encoders / parsers ─────────────────────────────────
		var qv = req.encodeRRQueryVersion(140);
		assert(qv.length === 12, "RRQueryVersion is 12 bytes");
		assert(qv.readUInt8(0) === 140, "randr major");
		assert(qv.readUInt8(1) === req.RANDR_MINOR_QUERY_VERSION, "minor 0");
		assert(qv.readUInt32LE(4) === req.RANDR_CLIENT_MAJOR, "client major");
		assert(qv.readUInt32LE(8) === req.RANDR_CLIENT_MINOR, "client minor");

		var qvReply = Buffer.alloc(32);
		qvReply.writeUInt8(1, 0);
		qvReply.writeUInt32LE(1, 8);
		qvReply.writeUInt32LE(5, 12);
		var qvParsed = req.parseRRQueryVersionReply(qvReply);
		assert(qvParsed.majorVersion === 1 && qvParsed.minorVersion === 5, "parsed RR version");

		var gm = req.encodeRRGetMonitors(140, 0x21F, true);
		assert(gm.length === 12, "RRGetMonitors is 12 bytes");
		assert(gm.readUInt8(1) === req.RANDR_MINOR_GET_MONITORS, "minor 42");
		assert(gm.readUInt32LE(4) === 0x21F, "window");
		assert(gm.readUInt8(8) === 1, "active-only");
		var gmInactive = req.encodeRRGetMonitors(140, 0x21F, false);
		assert(gmInactive.readUInt8(8) === 0, "active-only false");

		// Hand-roll a GetMonitors reply with 2 monitors:
		// monitor 0: 1 output, primary
		// monitor 1: 2 outputs, not primary
		// MonitorInfo sizes: 24+4=28, 24+8=32 → trailing data = 60 bytes = 15 4-byte units
		var gmReply = Buffer.alloc(32 + 60);
		gmReply.writeUInt8(1, 0);
		gmReply.writeUInt32LE(15, 4);    // 60/4
		gmReply.writeUInt32LE(0xCAFEBABE, 8);  // timestamp
		gmReply.writeUInt32LE(2, 12);    // nMonitors
		gmReply.writeUInt32LE(3, 16);    // nOutputs total
		// Monitor 0 @ off=32
		gmReply.writeUInt32LE(101, 32);   // name atom
		gmReply.writeUInt8(1, 36);        // primary
		gmReply.writeUInt8(1, 37);        // automatic
		gmReply.writeUInt16LE(1, 38);     // nOutput
		gmReply.writeInt16LE(0, 40);
		gmReply.writeInt16LE(0, 42);
		gmReply.writeUInt16LE(1920, 44);
		gmReply.writeUInt16LE(1080, 46);
		gmReply.writeUInt32LE(509, 48);   // 1080p widthMm
		gmReply.writeUInt32LE(286, 52);
		gmReply.writeUInt32LE(70, 56);    // output id
		// Monitor 1 @ off=60
		gmReply.writeUInt32LE(102, 60);
		gmReply.writeUInt8(0, 64);
		gmReply.writeUInt8(0, 65);
		gmReply.writeUInt16LE(2, 66);
		gmReply.writeInt16LE(1920, 68);
		gmReply.writeInt16LE(0, 70);
		gmReply.writeUInt16LE(2560, 72);
		gmReply.writeUInt16LE(1440, 74);
		gmReply.writeUInt32LE(597, 76);
		gmReply.writeUInt32LE(336, 80);
		gmReply.writeUInt32LE(80, 84);
		gmReply.writeUInt32LE(81, 88);
		var gmParsed = req.parseRRGetMonitorsReply(gmReply);
		assert(gmParsed.timestamp === 0xCAFEBABE, "timestamp");
		assert(gmParsed.monitors.length === 2, "2 monitors");
		assert(gmParsed.monitors[0].primary === true, "m0 primary");
		assert(gmParsed.monitors[0].width === 1920, "m0 width");
		assert(gmParsed.monitors[0].outputs.length === 1, "m0 1 output");
		assert(gmParsed.monitors[0].outputs[0] === 70, "m0 output id");
		assert(gmParsed.monitors[1].primary === false, "m1 not primary");
		assert(gmParsed.monitors[1].x === 1920, "m1 x offset");
		assert(gmParsed.monitors[1].outputs.length === 2, "m1 2 outputs");
		assert(gmParsed.monitors[1].outputs[1] === 81, "m1 second output id");

		var gmTrunc = false;
		var trunc2 = Buffer.alloc(32 + 20);
		trunc2.writeUInt8(1, 0);
		trunc2.writeUInt32LE(5, 4);
		trunc2.writeUInt32LE(1, 12);    // claims 1 monitor but body is too short
		try { req.parseRRGetMonitorsReply(trunc2); }
		catch (e) { gmTrunc = true; }
		assert(gmTrunc, "truncated MonitorInfo header rejected");

		// ── sequenceOf / packetTotalLength ───────────────────────────
		assert(req.sequenceOf(qeReply) === 42, "sequenceOf reply");
		assert(req.sequenceOf(errBuf) === 7, "sequenceOf error");
		var ev = Buffer.alloc(32); ev.writeUInt8(12, 0);  // event code
		assert(req.sequenceOf(ev) === -1, "sequenceOf event = -1");
		assert(req.packetTotalLength(errBuf) === 32, "error is 32 bytes");
		// Reply with extra bytes
		var bigReply = Buffer.alloc(8);
		bigReply.writeUInt8(1, 0);
		bigReply.writeUInt32LE(5, 4);    // 5 * 4 = 20 extra bytes
		assert(req.packetTotalLength(bigReply) === 52, "reply with extra bytes");

		// ── encodeGetKeyboardMapping / parseGetKeyboardMappingReply ──
		var km = req.encodeGetKeyboardMapping(8, 248);
		assert(km.length === 8, "GetKeyboardMapping is 8 bytes");
		assert(km.readUInt8(0) === req.OP_GET_KEYBOARD_MAPPING, "opcode 101");
		assert(km.readUInt16LE(2) === 2, "length = 2 (4-byte units)");
		assert(km.readUInt8(4) === 8, "first-keycode");
		assert(km.readUInt8(5) === 248, "count");

		// Reply: 2 keycodes × 4 keysyms-per-keycode = 8 KEYSYMs = 32 bytes
		var kmReply = Buffer.alloc(32 + 32);
		kmReply.writeUInt8(1, 0);
		kmReply.writeUInt8(4, 1);                 // keysyms-per-keycode = 4
		kmReply.writeUInt32LE(8, 4);              // 8 KEYSYMs trailing
		// keycode 8: 'a','A',0,0     (keysym 0x61='a', 0x41='A')
		kmReply.writeUInt32LE(0x61, 32 + 0);
		kmReply.writeUInt32LE(0x41, 32 + 4);
		// keycode 9: 'b','B',0,0
		kmReply.writeUInt32LE(0x62, 32 + 16);
		kmReply.writeUInt32LE(0x42, 32 + 20);
		var kmParsed = req.parseGetKeyboardMappingReply(kmReply);
		assert(kmParsed.keysymsPerKeycode === 4, "keysymsPerKeycode");
		assert(kmParsed.keysyms.length === 8, "8 keysyms total");
		assert(kmParsed.keysyms[0] === 0x61, "keycode 8 slot 0 = 'a'");
		assert(kmParsed.keysyms[5] === 0x42, "keycode 9 slot 1 = 'B'");

		var kmShort = false;
		try { req.parseGetKeyboardMappingReply(Buffer.alloc(16)); }
		catch (e) { kmShort = true; }
		assert(kmShort, "parseGetKeyboardMappingReply rejects short header");

		// ── Mechanism registry: xproto present and probed correctly ──
		// xproto is in the registry only on Linux (CAPABILITY_MECHANISMS.input
		// lists it for the Linux row); other platforms don't surface it.
		if (process.platform === "linux") {
			var inputMechs = mechatron.listMechanisms("input");
			var xpMech = inputMechs.find(function (m) { return m.name === "xproto"; });
			assert(xpMech, "xproto registered as input mechanism");
			// Reachability matches whether $DISPLAY's socket exists; we
			// just verify the probe did *something* (not the stale stub
			// "not yet implemented (Phase 6d)" reason).
			assert(!/not yet implemented/.test(xpMech.reason || ""),
				"xproto probe no longer returns 'not yet implemented'");
		}

		// ── Live connection smoke test ──────────────────────────────
		// When $DISPLAY is reachable, the Bun environment gives us a
		// real end-to-end exerciser: handshake, QueryExtension on a
		// known-good extension (XTEST is present on every Xvfb since
		// X.Org 1.0), and on a known-bad extension name.  Falls
		// through silently when there's no X server.
		var liveDone = false;
		if (process.platform === "linux" && process.env.DISPLAY) {
			var ep = wire.parseDisplay(process.env.DISPLAY);
			var fs = require("fs");
			if (ep && ep.kind === "unix" && fs.existsSync(ep.path)) {
				log("(live X) ");
				var conn = require("../lib/x11proto/conn");
				return (async function () {
					var c;
					try {
						c = await conn.XConnection.connect();
					} catch (e) {
						// Auth failures, permission issues: skip the live
						// portion rather than failing the whole test.
						log("(live skip: " + e.message + ") ");
						log("OK\n");
						return true;
					}
					assert(c.info && typeof c.info.vendor === "string", "live vendor");
					assert(c.info.screens.length >= 1, "at least one screen");
					assert(c.info.screens[0].widthPx > 0, "screen has width");
					var xt = await c.queryExtension("XTEST");
					assert(xt.present === true, "XTEST present");
					assert(xt.majorOpcode > 0, "XTEST majorOpcode > 0");
					var bad = await c.queryExtension("NOT-AN-EXTENSION");
					assert(bad.present === false, "bogus extension absent");

					// Live FakeInput smoke: any malformed request would
					// land an XError that tears the connection down.  The
					// post-call queryExtension proves the connection is
					// still healthy.
					await c.fakeMotion(20, 30);
					await c.fakeButtonPress(1);
					await c.fakeButtonRelease(1);
					await c.fakeKeyPress(38);
					await c.fakeKeyRelease(38);
					c.warpPointer(15, 25);
					var img = await c.getImage({ x: 0, y: 0, width: 8, height: 8 });
					assert(img.depth >= 8, "captured image depth >= 8");
					// 8x8 ZPixmap on a 24/32-bit visual = 8*8*4 = 256 bytes
					assert(img.data.length >= 64, "captured image data >= 64 bytes (got " + img.data.length + ")");

					// Keyboard mapping: first call parses, second returns cache.
					var km1 = await c.getKeyboardMapping();
					assert(km1.keysymsPerKeycode > 0, "keysymsPerKeycode > 0");
					assert(km1.keysyms.length > 0, "keysyms populated");
					var km2 = await c.getKeyboardMapping();
					assert(km2 === km1, "getKeyboardMapping cached");
					// Unknown keysym yields 0 (matches libX11 XKeysymToKeycode).
					assert(c.keysymToKeycode(0xDEADBEEF) === 0, "unknown keysym -> 0");
					// 'a' (keysym 0x61) should map to a real keycode on any
					// standard X.Org layout.
					var codeA = c.keysymToKeycode(0x61);
					assert(codeA >= c.info.minKeycode && codeA <= c.info.maxKeycode,
						"'a' maps to in-range keycode (got " + codeA + ")");

					// RANDR: try GetMonitors but tolerate servers without RandR
					// (e.g. very old Xvfb builds compiled without it).
					try {
						var mons = await c.getMonitors();
						assert(Array.isArray(mons.monitors), "monitors is array");
						if (mons.monitors.length > 0) {
							assert(mons.monitors[0].width > 0, "first monitor has width");
							assert(mons.monitors[0].height > 0, "first monitor has height");
						}
					} catch (e) {
						if (!/RANDR/.test(e.message)) throw e;
					}

					var alive = await c.queryExtension("XTEST");
					assert(alive.present === true, "connection survived FakeInput + WarpPointer + GetImage + RANDR burst");

					c.close();
					// Post-close rejection
					var postCloseThrew = false;
					try { await c.queryExtension("XTEST"); }
					catch (_) { postCloseThrew = true; }
					assert(postCloseThrew, "post-close sendRequest rejects");

					// ── FFI bridge: sync→async dispatch via lib/ffi/xproto ──
					// Only exercise under the FFI backend — the napi backend
					// doesn't load lib/ffi/xproto.ts and the sync wrappers
					// would have nothing to forward to.
					var be = (process.env.MECHATRON_BACKEND || "").toLowerCase();
					if (be === "ffi") {
						log("(ffi bridge) ");
						var Platform = mechatron.Platform;
						var prior = Platform.getPreferredMechanisms("input");
						Platform.setMechanism("input", "xproto");
						assert(Platform.getMechanism("input") === "xproto",
							"xproto selected as input mechanism");
						var bridge = require("../lib/ffi/xproto");
						bridge._resetXprotoForTests();
						// Sync calls enqueue async work.  Flush to await completion.
						bridge.xprotoSetPos(42, 51);
						bridge.xprotoMousePress(mechatron.BUTTON_LEFT);
						bridge.xprotoMouseRelease(mechatron.BUTTON_LEFT);
						bridge.xprotoScrollV(1);
						bridge.xprotoScrollH(-1);
						// 'a' keysym
						bridge.xprotoKeyPress(0x61);
						bridge.xprotoKeyRelease(0x61);
						await bridge.xprotoFlush();
						assert(bridge.xprotoReady(),
							"xproto bridge opened conn and survived press burst");
						assert(bridge.xprotoOpenReason() === null,
							"xproto open reason is null (success)");

						// Dispatch through the public API — routes to xproto
						// because we pinned the mechanism above.
						var kb = new mechatron.Keyboard();
						kb.press(0x61);
						kb.release(0x61);
						var ms = new mechatron.Mouse();
						ms.press(mechatron.BUTTON_LEFT);
						ms.release(mechatron.BUTTON_LEFT);
						mechatron.Mouse.setPos(123, 234);
						await bridge.xprotoFlush();

						bridge._resetXprotoForTests();
						if (prior && prior.length) Platform.setMechanism("input", prior);
						else Platform.resetMechanism("input");
					}

					log("OK\n");
					liveDone = true;
					return true;
				})();
			}
		}

		log("OK\n");
		return true;
	}

	return {
		testXproto: testXproto,
	};
};
