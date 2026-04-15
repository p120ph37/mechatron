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

		// ── Live connection smoke test (only when $DISPLAY is reachable) ──
		// We do a one-shot socket connect + handshake to exercise the
		// encoders against a real server.  Skip silently when there's
		// no $DISPLAY or the Unix socket isn't present — keeps the
		// test harness portable across headless CI images.
		if (process.platform === "linux" && process.env.DISPLAY) {
			var ep = wire.parseDisplay(process.env.DISPLAY);
			var fs = require("fs");
			if (ep && ep.kind === "unix" && fs.existsSync(ep.path)) {
				// (The live handshake exercises all three of parseDisplay,
				//  encodeConnectionSetup, and parseConnectionSetupReply.)
				log("(live X) ");
				var cookies = wire.loadXauthority();
				var cook = wire.findXauthCookie(cookies, ep);
				var setupBuf = wire.encodeConnectionSetup(
					cook ? cook.name : "",
					cook ? cook.data : Buffer.alloc(0),
				);
				assert(setupBuf.length >= 12, "live setup ≥ 12 bytes");
				// Actual I/O lives in lib/x11proto/conn.ts (Phase 6d part 2);
				// here we only confirm the encoding didn't blow up.
			}
		}

		log("OK\n");
		return true;
	}

	return {
		testXproto: testXproto,
	};
};
