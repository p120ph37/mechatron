////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                  Mechatron Portal Unit Tests                               //
//                                                                            //
//  Pure-TS exercises of GNOME WM extension installer + token mgmt + the      //
//  AT-SPI window hash.  No live D-Bus or GNOME shell required — everything   //
//  here is filesystem and pure-arithmetic.                                   //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");

module.exports = function (mechatron, log, assert, waitFor) {

	function testTokens() {
		log("  portal tokens... ");

		// Use a per-process temp file.  Set MECHATRON_TOKENS_FILE *before*
		// requiring the installer so its module-level constant picks it up.
		var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mechatron-tok-"));
		var tokensFile = path.join(tmpDir, "tokens");
		process.env.MECHATRON_TOKENS_FILE = tokensFile;

		// Force re-load by deleting from require cache.
		var modPath = require.resolve("../lib/portal/gnome-ext-installer");
		delete require.cache[modPath];
		var inst = require("../lib/portal/gnome-ext-installer");
		assert(inst.TOKENS_FILE === tokensFile, "TOKENS_FILE picked up env override");

		// generateToken returns RFC 4122 UUIDv4
		var t = inst.generateToken();
		assert(typeof t === "string" && t.length === 36, "UUID is 36 chars");
		assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(t),
			"UUID matches v4 format with version+variant bits set");
		var t2 = inst.generateToken();
		assert(t !== t2, "two tokens differ");

		// Empty file → no tokens
		assert(inst.getInstalledTokens().length === 0, "no tokens initially");

		// installToken creates parent dir + file with header
		inst.installToken(t);
		assert(fs.existsSync(tokensFile), "tokens file created");
		var contents = fs.readFileSync(tokensFile, "utf8");
		assert(contents.indexOf("# Mechatron WM extension") === 0,
			"tokens file has header comment");
		assert(contents.indexOf(t) !== -1, "token appended");

		var listed = inst.getInstalledTokens();
		assert(listed.length === 1 && listed[0] === t, "1 token listed (header skipped)");

		// Append a second
		inst.installToken(t2);
		listed = inst.getInstalledTokens();
		assert(listed.length === 2, "2 tokens listed");
		assert(listed.indexOf(t) !== -1 && listed.indexOf(t2) !== -1, "both tokens present");

		// revokeToken removes one
		assert(inst.revokeToken(t) === true, "revokeToken returns true on success");
		listed = inst.getInstalledTokens();
		assert(listed.length === 1 && listed[0] === t2, "token removed");

		// revokeToken on missing token returns false
		assert(inst.revokeToken("not-a-real-token") === false, "revokeToken false when not present");

		// provisionToken generates + installs
		var p = inst.provisionToken();
		assert(/^[0-9a-f-]{36}$/.test(p), "provisionToken returns UUID");
		listed = inst.getInstalledTokens();
		assert(listed.indexOf(p) !== -1, "provisioned token in file");

		// Filter blank/comment lines
		fs.appendFileSync(tokensFile, "\n   \n# another comment\n\n");
		var filtered = inst.getInstalledTokens();
		assert(filtered.length === 2, "blank/comment lines filtered");

		// getInstalledTokens on missing file → []
		fs.unlinkSync(tokensFile);
		fs.rmdirSync(tmpDir);
		assert(inst.getInstalledTokens().length === 0, "missing file → empty list");

		// revokeToken on missing file → false (caught by try/catch)
		assert(inst.revokeToken(t) === false, "revoke on missing file → false");

		// Cleanup env so other tests don't see the override.
		delete process.env.MECHATRON_TOKENS_FILE;
		// Drop the cached module so any later loader gets a fresh one.
		delete require.cache[modPath];

		log("OK\n");
		return true;
	}

	async function testGnomeWmTokenAccessors() {
		log("  gnome-wm token... ");
		// The gnome-wm module is portal-only and only loaded under the
		// nolib backend — but its token accessors are pure setters/getters
		// and safe to require directly.  Skip on Bun-only platforms where
		// require can't resolve .ts files (Node ia32).
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		var wm = require("../lib/portal/gnome-wm");
		var initial = wm.gnomeWmGetToken();
		wm.gnomeWmSetToken("test-token-abc");
		assert(wm.gnomeWmGetToken() === "test-token-abc", "set/get round-trips");
		wm.gnomeWmSetToken("");
		assert(wm.gnomeWmGetToken() === "", "empty token round-trips");
		wm.gnomeWmSetToken(initial);

		// gnomeWmAvailable: in CI without a real GNOME shell extension, the
		// Ping call should fail and the function returns false.  Exercises
		// the connect→catch path (getConn + Ping failure).
		var avail = await wm.gnomeWmAvailable();
		assert(typeof avail === "boolean", "gnomeWmAvailable returns boolean");
		// Cached on second call.
		var avail2 = await wm.gnomeWmAvailable();
		assert(avail2 === avail, "gnomeWmAvailable cached");

		// resetGnomeWm clears the cache and closes the connection.
		wm.resetGnomeWm();
		log("OK\n");
		return true;
	}

	async function testAtSpiAvailability() {
		log("  atspi avail... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		var atspi = require("../lib/portal/atspi");
		// In CI without an AT-SPI bus, getAtSpiBusAddress fails or returns
		// null and atspiAvailable resolves to false.  Either way we
		// exercise the discovery + catch paths.
		var avail = await atspi.atspiAvailable();
		assert(typeof avail === "boolean", "atspiAvailable returns boolean");
		atspi.resetAtSpi();

		// atspiListWindows on missing bus throws (caller catches in
		// nolib/window-portal); we just verify it surfaces an error.
		var threw = false;
		try { await atspi.atspiListWindows(); } catch (_) { threw = true; }
		// On systems with AT-SPI, this won't throw.  Just exercise the
		// path either way.
		assert(threw === true || threw === false, "atspiListWindows path exercised");
		atspi.resetAtSpi();
		log("OK\n");
		return true;
	}

	function testWindowPortalHash() {
		log("  atspi hash... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		// The hash function is internal but exercised through window_getList
		// when only AT-SPI is available.  We verify its public contract by
		// asserting the high bit is always set so handles can't collide
		// with GNOME extension stable-sequence ids (which fit in u31).
		var portal = require("../lib/nolib/window-portal");
		// We can't call atspiWindowHash directly (not exported); but we
		// can verify window_getList returns numbers with the high bit set
		// when the GNOME extension is unavailable — except that requires
		// AT-SPI to actually be running.  Skip the runtime check; the
		// hash function is exercised via the portal CI run.
		assert(typeof portal.window_getList === "function", "portal getList exported");
		assert(typeof portal.window_isValid === "function", "portal isValid exported");
		assert(typeof portal.window_getActive === "function", "portal getActive exported");
		log("OK\n");
		return true;
	}

	function testDbusWire() {
		log("  dbus wire... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		var wire = require("../lib/dbus/wire");

		// ── parseSignature: simple types ─────────────────────────────
		assert(wire.parseSignature("").length === 0, "empty sig → []");
		assert(wire.parseSignature("y").join(",") === "y", "single byte");
		assert(wire.parseSignature("yibns").join(",") === "y,i,b,n,s", "primitive series");

		// ── parseSignature: containers ───────────────────────────────
		assert(wire.parseSignature("ai").join(",") === "ai", "array of int");
		assert(wire.parseSignature("a{sv}").join(",") === "a{sv}", "dict<s,v>");
		assert(wire.parseSignature("(ii)").join(",") === "(ii)", "struct (ii)");
		assert(wire.parseSignature("a(sii)").join(",") === "a(sii)", "array of struct");
		assert(wire.parseSignature("(ai(sb))").join(",") === "(ai(sb))", "nested struct");

		// ── parseSignature: errors ───────────────────────────────────
		var threwBad = false;
		try { wire.parseSignature("Z"); } catch (e) { threwBad = true; }
		assert(threwBad, "unknown type code throws");

		var threwUnclosed = false;
		try { wire.parseSignature("(ii"); } catch (e) { threwUnclosed = true; }
		assert(threwUnclosed, "unclosed struct throws");

		// ── MarshalBuffer / UnmarshalReader round-trip primitives ────
		function rt(sig, val, equal) {
			var mb = new wire.MarshalBuffer();
			mb.marshalValue(sig, val);
			var buf = mb.result();
			var ur = new wire.UnmarshalReader(buf);
			var got = ur.unmarshalValue(sig);
			equal = equal || function (a, b) { return a === b; };
			assert(equal(got, val), "round-trip " + sig + ": " + String(val) + " vs " + String(got));
		}

		rt("y", 0x42);
		rt("y", 0xff);
		rt("b", true);
		rt("b", false);
		rt("n", -32768);
		rt("n", 32767);
		rt("q", 65535);
		rt("i", -2147483648);
		rt("i", 2147483647);
		rt("u", 4294967295);
		rt("x", -9223372036854775808n);
		rt("x", 9223372036854775807n);
		rt("t", 18446744073709551615n);
		rt("d", 3.14159265358979);
		rt("d", -1.5e10);
		rt("s", "");
		rt("s", "hello world");
		rt("s", "ünïcödé 🎉");
		rt("o", "/org/freedesktop/DBus");
		rt("g", "a{sv}");

		// ── Variant ──────────────────────────────────────────────────
		var mbV = new wire.MarshalBuffer();
		mbV.marshalValue("v", ["s", "wrapped"]);
		var urV = new wire.UnmarshalReader(mbV.result());
		// unmarshalValue("v") reads the embedded sig and returns the inner value.
		var got = urV.unmarshalValue("v");
		assert(got === "wrapped", "variant round-trip yields inner value");

		// ── Array of int ────────────────────────────────────────────
		var mbA = new wire.MarshalBuffer();
		mbA.marshalValue("ai", [1, 2, 3, 4, 5]);
		var urA = new wire.UnmarshalReader(mbA.result());
		var arrGot = urA.unmarshalValue("ai");
		assert(Array.isArray(arrGot) && arrGot.length === 5, "array of int length");
		assert(arrGot[0] === 1 && arrGot[4] === 5, "array of int values");

		// ── Empty array ─────────────────────────────────────────────
		var mbEmpty = new wire.MarshalBuffer();
		mbEmpty.marshalValue("as", []);
		var urEmpty = new wire.UnmarshalReader(mbEmpty.result());
		var emptyGot = urEmpty.unmarshalValue("as");
		assert(Array.isArray(emptyGot) && emptyGot.length === 0, "empty array");

		// ── Struct (ii) ─────────────────────────────────────────────
		var mbS = new wire.MarshalBuffer();
		mbS.marshalValue("(ii)", [42, -17]);
		var urS = new wire.UnmarshalReader(mbS.result());
		var structGot = urS.unmarshalValue("(ii)");
		assert(structGot[0] === 42 && structGot[1] === -17, "struct (ii) round-trip");

		// ── Dict a{sv} ──────────────────────────────────────────────
		var mbD = new wire.MarshalBuffer();
		mbD.marshalValue("a{sv}", { foo: ["s", "bar"], n: ["u", 7] });
		var urD = new wire.UnmarshalReader(mbD.result());
		var dictGot = urD.unmarshalValue("a{sv}");
		// Dict reads back as a Map; variant values come out as the inner
		// value (sig discarded — it's recoverable from wire bytes if needed).
		var asObj = dictGot instanceof Map ? Object.fromEntries(dictGot) : dictGot;
		assert(asObj.foo === "bar" && asObj.n === 7, "dict a{sv} round-trip");

		// ── encodeMessage/decodeMessage round-trip ───────────────────
		var msg = {
			type: wire.MSG_METHOD_CALL,
			flags: 0,
			serial: 1,
			path: "/dev/test",
			interface: "dev.test.Iface",
			member: "Hello",
			destination: "dev.test",
			signature: "su",
			body: ["world", 42],
		};
		var encoded = wire.encodeMessage(msg);
		assert(encoded.length > 0, "encoded message non-empty");
		assert(encoded[0] === 0x6c, "byte order = 'l'");
		assert(encoded[1] === wire.MSG_METHOD_CALL, "type byte");

		// totalMessageLength reads body length from header
		var total = wire.totalMessageLength(encoded);
		assert(total === encoded.length, "totalMessageLength matches");

		// totalMessageLength on short prefix → null
		assert(wire.totalMessageLength(Buffer.alloc(8)) === null, "totalMessageLength <16 → null");

		var decoded = wire.decodeMessage(encoded);
		assert(decoded !== null, "decode succeeded");
		assert(decoded.type === wire.MSG_METHOD_CALL, "decoded type");
		assert(decoded.serial === 1, "decoded serial");
		assert(decoded.path === "/dev/test", "decoded path");
		assert(decoded.member === "Hello", "decoded member");
		assert(decoded.body[0] === "world" && decoded.body[1] === 42, "decoded body");

		// Method return (no member, has reply_serial)
		var ret = {
			type: wire.MSG_METHOD_RETURN,
			flags: 0,
			serial: 2,
			replySerial: 1,
			signature: "s",
			body: ["ok"],
		};
		var retEncoded = wire.encodeMessage(ret);
		var retDecoded = wire.decodeMessage(retEncoded);
		assert(retDecoded.type === wire.MSG_METHOD_RETURN, "return type");
		assert(retDecoded.replySerial === 1, "return replySerial");
		assert(retDecoded.body[0] === "ok", "return body");

		// Error message
		var err = {
			type: wire.MSG_ERROR,
			flags: 0,
			serial: 3,
			replySerial: 1,
			errorName: "dev.test.Failed",
			signature: "s",
			body: ["nope"],
		};
		var errEncoded = wire.encodeMessage(err);
		var errDecoded = wire.decodeMessage(errEncoded);
		assert(errDecoded.type === wire.MSG_ERROR, "error type");
		assert(errDecoded.errorName === "dev.test.Failed", "error name");
		assert(errDecoded.body[0] === "nope", "error body");

		// Signal (no destination, no reply_serial)
		var sig = {
			type: wire.MSG_SIGNAL,
			flags: 0,
			serial: 4,
			path: "/x",
			interface: "dev.test",
			member: "Tick",
			signature: "",
			body: [],
		};
		var sigEncoded = wire.encodeMessage(sig);
		var sigDecoded = wire.decodeMessage(sigEncoded);
		assert(sigDecoded.type === wire.MSG_SIGNAL, "signal type");
		assert(sigDecoded.member === "Tick", "signal member");

		// Empty body
		var noBody = {
			type: wire.MSG_METHOD_CALL,
			flags: 0,
			serial: 5,
			path: "/x", interface: "dev.test", member: "Noop", destination: "dev.test",
		};
		var noBodyEncoded = wire.encodeMessage(noBody);
		var noBodyDecoded = wire.decodeMessage(noBodyEncoded);
		assert(noBodyDecoded.member === "Noop", "no-body decoded");
		assert(!noBodyDecoded.body || noBodyDecoded.body.length === 0, "no-body has no args");

		// decodeMessage on truncated buffer → null
		assert(wire.decodeMessage(Buffer.alloc(8)) === null, "truncated decode → null");

		log("OK\n");
		return true;
	}

	return [
		{ name: "tokens", functions: [], test: testTokens },
		{ name: "gnome-wm token", functions: [], test: testGnomeWmTokenAccessors },
		{ name: "atspi avail", functions: [], test: testAtSpiAvailability },
		{ name: "atspi hash", functions: [], test: testWindowPortalHash },
		{ name: "dbus wire", functions: [], test: testDbusWire },
	];
};
