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
		// Bun resolves .ts imports natively; Node ia32 can't.  Skip on
		// node so the legacy Windows ia32 runner doesn't blow up.
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		// Use a per-process temp file.  Set MECHATRON_TOKENS_FILE *before*
		// requiring the installer so its module-level constant picks it up.
		var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mechatron-tok-"));
		var tokensFile = path.join(tmpDir, "tokens");
		process.env.MECHATRON_TOKENS_FILE = tokensFile;

		// Force re-load by deleting from require cache.
		var modPath = require.resolve("../lib/gext/installer");
		delete require.cache[modPath];
		var inst = require("../lib/gext/installer");
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

	async function testGextWindowAccessors() {
		log("  gext token... ");
		// The gext window module is portal/gext-only and only loaded under the
		// nolib backend — but its token accessors are pure setters/getters
		// and safe to require directly.  Skip on Bun-only platforms where
		// require can't resolve .ts files (Node ia32).
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		var wm = require("../lib/gext/window");
		var initial = wm.gextWinGetToken();
		wm.gextWinSetToken("test-token-abc");
		assert(wm.gextWinGetToken() === "test-token-abc", "set/get round-trips");
		wm.gextWinSetToken("");
		assert(wm.gextWinGetToken() === "", "empty token round-trips");
		wm.gextWinSetToken(initial);

		// gextWinAvailable: in CI without a real GNOME shell extension, the
		// Ping call should fail and the function returns false.  Exercises
		// the connect→catch path (getConn + Ping failure).
		var avail = await wm.gextWinAvailable();
		assert(typeof avail === "boolean", "gextWinAvailable returns boolean");
		// Cached on second call.
		var avail2 = await wm.gextWinAvailable();
		assert(avail2 === avail, "gextWinAvailable cached");

		// resetGextWindow clears the cache and closes the connection.
		wm.resetGextWindow();
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

		if (avail) {
			// AT-SPI bus is reachable (CI ffi-atspi cell, or local desktop).
			// Exercise the full listing path: enumerate top-level windows of
			// every accessible app, parse role/name/bounds via D-Bus.
			// Returns an array (possibly empty if no a11y-enabled apps are
			// running) — never throws when the bus is up.
			var windows = await atspi.atspiListWindows();
			assert(Array.isArray(windows), "atspiListWindows returns array when bus available");
			// Each entry is { hash, x, y, w, h, role, name, pid }.  Don't
			// require any specific entries (depends on session contents),
			// but verify shape if any are present.
			for (var i = 0; i < windows.length; ++i) {
				var w = windows[i];
				assert(typeof w === "object" && w !== null,
					"atspiListWindows entry " + i + " is object");
				assert(typeof w.hash === "number" || typeof w.hash === "bigint",
					"atspiListWindows entry " + i + " has hash");
				assert(typeof w.x === "number" && typeof w.y === "number",
					"atspiListWindows entry " + i + " has x/y");
				assert(typeof w.w === "number" && typeof w.h === "number",
					"atspiListWindows entry " + i + " has w/h");
			}
			atspi.resetAtSpi();
			// After reset, calling again re-discovers the bus (covers the
			// cache-warm-on-second-call path).
			var avail2 = await atspi.atspiAvailable();
			assert(avail2 === true, "atspiAvailable still true after reset");
		} else {
			// atspiListWindows on missing bus throws (caller catches in
			// nolib/window-portal); verify it surfaces an error.
			var threw = false;
			try { await atspi.atspiListWindows(); } catch (_) { threw = true; }
			assert(threw === true, "atspiListWindows throws when bus unavailable");
		}

		atspi.resetAtSpi();
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

	async function testPlatformApi() {
		log("  platform api... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		var plat = require("../lib/platform");
		var Platform = plat.Platform;

		// --- listMechanisms / getMechanism / getCapabilities ---
		var caps = ["input", "screen", "clipboard"];
		for (var i = 0; i < caps.length; i++) {
			var list = Platform.listMechanisms(caps[i]);
			assert(Array.isArray(list), "listMechanisms(" + caps[i] + ") array");
			var mech = Platform.getMechanism(caps[i]);
			assert(mech === null || typeof mech === "string",
				"getMechanism(" + caps[i] + ") string|null");
			var capInfo = Platform.getCapabilities(caps[i]);
			assert(typeof capInfo === "object", "getCapabilities(" + caps[i] + ") object");
			assert(typeof capInfo.requiresElevatedPrivileges === "boolean",
				"getCapabilities(" + caps[i] + ").requiresElevatedPrivileges");
			assert(typeof capInfo.supportsOffScreen === "boolean",
				"getCapabilities(" + caps[i] + ").supportsOffScreen");
			assert(Array.isArray(capInfo.mechanisms),
				"getCapabilities(" + caps[i] + ").mechanisms");
		}

		// --- getPreferredMechanisms when no override set ---
		Platform.resetMechanism("clipboard");
		var pref = Platform.getPreferredMechanisms("clipboard");
		// null when no env override and no setMechanism call
		if (!process.env.MECHATRON_CLIPBOARD_MECHANISM) {
			assert(pref === null, "getPreferredMechanisms null when auto");
		}

		// --- setMechanism + getPreferredMechanisms round-trip ---
		var origMech = Platform.getMechanism("clipboard");
		var clipList = Platform.listMechanisms("clipboard");
		if (clipList.length > 0) {
			var validName = clipList[0].name;
			Platform.setMechanism("clipboard", validName);
			pref = Platform.getPreferredMechanisms("clipboard");
			assert(pref !== null && pref[0] === validName,
				"setMechanism + getPreferredMechanisms round-trip");

			// setMechanism with array
			Platform.setMechanism("clipboard", [validName]);
			pref = Platform.getPreferredMechanisms("clipboard");
			assert(pref !== null && pref[0] === validName,
				"setMechanism array + getPreferred");
		}

		// --- setMechanism("none") ---
		Platform.setMechanism("clipboard", "none");
		assert(Platform.getMechanism("clipboard") === "none",
			"setMechanism none");

		// --- setMechanism with unknown name throws ---
		var threw = false;
		try { Platform.setMechanism("clipboard", "not-a-real-mechanism"); }
		catch (_) { threw = true; }
		assert(threw, "setMechanism unknown throws");

		// --- setMechanism with empty list throws ---
		threw = false;
		try { Platform.setMechanism("clipboard", []); }
		catch (_) { threw = true; }
		assert(threw, "setMechanism empty array throws");

		// --- resetMechanism ---
		Platform.resetMechanism("clipboard");
		assert(Platform.getMechanism("clipboard") !== "none" || clipList.length === 0,
			"resetMechanism clears none");

		// --- saveScreenPermission / loadScreenPermission round-trip ---
		var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mechatron-perm-"));
		var permFile = path.join(tmpDir, "screen-perm.json");

		// saveScreenPermission returns false when no handle set
		assert(await Platform.saveScreenPermission(permFile) === false,
			"saveScreenPermission false when no handle");

		// Set a handle, save, clear, load
		plat._setSavedScreenHandle({ token: "test-perm-123", fd: 42 });
		assert(await Platform.saveScreenPermission(permFile) === true,
			"saveScreenPermission true");
		assert(fs.existsSync(permFile), "perm file created");

		plat._setSavedScreenHandle(null);
		assert(await Platform.loadScreenPermission(permFile) === true,
			"loadScreenPermission true");
		var loaded = plat._getSavedScreenHandle();
		assert(loaded && loaded.token === "test-perm-123" && loaded.fd === 42,
			"loadScreenPermission round-trip");

		// loadScreenPermission on missing file returns false
		fs.unlinkSync(permFile);
		plat._setSavedScreenHandle(null);
		assert(await Platform.loadScreenPermission(permFile) === false,
			"loadScreenPermission missing file false");

		// loadScreenPermission on invalid JSON returns false
		fs.writeFileSync(path.join(tmpDir, "bad.json"), "not json {{{");
		assert(await Platform.loadScreenPermission(path.join(tmpDir, "bad.json")) === false,
			"loadScreenPermission bad JSON false");

		// Cleanup
		try { fs.unlinkSync(path.join(tmpDir, "bad.json")); } catch (_) {}
		try { fs.rmdirSync(tmpDir); } catch (_) {}
		plat._setSavedScreenHandle(null);

		log("OK\n");
		return true;
	}

	async function testRemoteDesktop() {
		log("  remote-desktop... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		var rd = require("../lib/portal/remote-desktop");

		// remoteDesktopAvailable is a sync env-var probe (Wayland +
		// session bus). On non-Linux this is always false. On Linux it
		// depends on the test cell — true under the nolib[portal] cell,
		// false elsewhere. Either way the result must be a boolean and
		// must match a manual env check.
		var avail = rd.remoteDesktopAvailable();
		assert(typeof avail === "boolean", "remoteDesktopAvailable returns boolean");
		if (process.platform !== "linux") {
			assert(avail === false, "remoteDesktopAvailable false on non-Linux");
		}

		// resetSession is idempotent and has no return — exercise the
		// "no session yet" branch.
		assert(rd.resetSession() === undefined, "resetSession returns undefined");
		assert(rd.resetSession() === undefined, "resetSession idempotent");

		// On Linux without a portal session, getSession + notify* throw
		// or fail to connect. We just exercise the rejection path so the
		// promise chain is covered.
		if (process.platform === "linux" && !avail) {
			var threw = false;
			try { await rd.notifyPointerMotion(0, 0); } catch (_) { threw = true; }
			assert(threw === true, "notifyPointerMotion rejects when portal unavailable");
		}

		if (process.platform === "linux" && avail) {
			rd.resetSession();
			try {
				await rd.notifyPointerMotionAbsolute(100, 200);
				log("(absolute OK) ");
			} catch (e) {
				log("(absolute unavail: " + e.message + ") ");
			}
			rd.resetSession();
		}

		log("OK\n");
		return true;
	}

	function testInstallerCoverage() {
		log("  installer coverage... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		// Re-load installer with a temp TOKENS_FILE so bun's coverage
		// tracker sees it in require.cache at exit time (the earlier
		// testTokens test deletes it from cache, losing coverage).
		var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mechatron-inst-"));
		var tokensFile = path.join(tmpDir, "tokens");
		process.env.MECHATRON_TOKENS_FILE = tokensFile;
		var modPath = require.resolve("../lib/gext/installer");
		delete require.cache[modPath];
		var inst = require("../lib/gext/installer");
		assert(inst.TOKENS_FILE === tokensFile, "TOKENS_FILE env picked up");

		// generateToken → uuidv4: pure, no file I/O
		var t = inst.generateToken();
		assert(typeof t === "string" && t.length === 36, "generateToken UUID length");
		assert(/^[0-9a-f]{8}-/.test(t), "generateToken UUID format");

		// getInstalledTokens: no file yet → []
		assert(inst.getInstalledTokens().length === 0, "no tokens initially");

		// installToken creates dir + file
		inst.installToken(t);
		assert(fs.existsSync(tokensFile), "tokens file created");
		var listed = inst.getInstalledTokens();
		assert(listed.length === 1 && listed[0] === t, "1 token after install");

		// revokeToken: success case
		assert(inst.revokeToken(t) === true, "revokeToken success");
		assert(inst.getInstalledTokens().length === 0, "0 tokens after revoke");

		// revokeToken: missing token
		assert(inst.revokeToken("not-a-token") === false, "revokeToken false for missing");

		// provisionToken: generates + installs
		var p = inst.provisionToken();
		assert(/^[0-9a-f-]{36}$/.test(p), "provisionToken UUID");
		assert(inst.getInstalledTokens().indexOf(p) !== -1, "provisioned in file");

		// isExtensionInstalled / isExtensionEnabled
		assert(typeof inst.isExtensionInstalled() === "boolean", "isExtensionInstalled boolean");
		assert(typeof inst.isExtensionEnabled() === "boolean", "isExtensionEnabled boolean");

		// installExtension: exercises the full install path (copy, enable attempt, token)
		var result = inst.installExtension({ provisionToken: true });
		assert(typeof result === "object", "installExtension returns object");
		assert(typeof result.installed === "boolean", "result.installed boolean");
		assert(typeof result.enabled === "boolean", "result.enabled boolean");
		assert(typeof result.needsRestart === "boolean", "result.needsRestart boolean");
		if (result.installed && result.token) {
			assert(/^[0-9a-f-]{36}$/.test(result.token), "installExtension token is UUID");
		}

		// installExtension without provisionToken
		var result2 = inst.installExtension({ provisionToken: false });
		assert(typeof result2 === "object", "installExtension(noToken) returns object");
		assert(result2.token === undefined, "no token when provisionToken=false");

		// Cleanup installed extension
		var cp = require("child_process");
		var extTarget = path.join(
			process.env.HOME || "/tmp",
			".local", "share", "gnome-shell", "extensions",
			"mechatron@mechatronic.dev");
		try { cp.execSync("rm -rf " + extTarget, { stdio: "ignore" }); } catch(_) {}

		// Cleanup temp files but do NOT delete require.cache — leave the
		// module in cache so bun's coverage tracker sees it at exit.
		try { fs.unlinkSync(tokensFile); } catch(_) {}
		try { fs.rmdirSync(tmpDir); } catch(_) {}
		delete process.env.MECHATRON_TOKENS_FILE;

		log("OK\n");
		return true;
	}

	async function testDbusConnection() {
		log("  dbus connection... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }
		if (process.platform !== "linux") { log("(skip: non-linux)\n"); return true; }

		var childProcess = require("child_process");
		var DBusConnection = require("../lib/dbus/connection").DBusConnection;
		var DBusError = require("../lib/dbus/connection").DBusError;

		var sockPath = "/tmp/mechatron_test_dbus_" + process.pid;
		var daemon = null;
		try {
			var result = childProcess.execSync(
				"dbus-daemon --session --fork --address=unix:path=" + sockPath + " --print-pid",
				{ encoding: "utf8", timeout: 5000 }
			).trim();
			daemon = parseInt(result, 10);
		} catch (e) {
			log("(skip: no dbus-daemon)\n");
			return true;
		}

		try {
			var conn = await DBusConnection.connect("unix:path=" + sockPath);
			assert(typeof conn.getUniqueName() === "string", "uniqueName is string");
			assert(conn.getUniqueName().startsWith(":"), "uniqueName starts with :");

			var reply = await conn.call({
				path: "/org/freedesktop/DBus",
				interface: "org.freedesktop.DBus",
				member: "ListNames",
				destination: "org.freedesktop.DBus",
			});
			assert(Array.isArray(reply.body[0]), "ListNames returns array");
			assert(reply.body[0].indexOf("org.freedesktop.DBus") !== -1,
				"ListNames includes the bus itself");

			var signalReceived = false;
			var unsub = conn.onSignal(function (msg) {
				if (msg.member === "NameAcquired" || msg.member === "NameOwnerChanged") {
					signalReceived = true;
				}
			});
			assert(typeof unsub === "function", "onSignal returns unsubscribe fn");

			await conn.call({
				path: "/org/freedesktop/DBus",
				interface: "org.freedesktop.DBus",
				member: "AddMatch",
				destination: "org.freedesktop.DBus",
				signature: "s",
				body: ["type='signal'"],
			});

			var noReplyResult = await conn.call({
				path: "/org/freedesktop/DBus",
				interface: "org.freedesktop.DBus",
				member: "GetId",
				destination: "org.freedesktop.DBus",
				noReply: true,
			});
			assert(noReplyResult.body.length === 0, "noReply returns empty body");

			var threw = false;
			try {
				await conn.call({
					path: "/org/freedesktop/DBus",
					interface: "org.freedesktop.DBus",
					member: "GetNameOwner",
					destination: "org.freedesktop.DBus",
					signature: "s",
					body: ["com.does.not.exist.ever"],
				});
			} catch (e) {
				threw = true;
				assert(e instanceof DBusError, "error is DBusError");
				assert(e.name.indexOf("NameHasNoOwner") !== -1 ||
					e.name.indexOf("Error") !== -1,
					"DBusError has appropriate name");
			}
			assert(threw, "GetNameOwner throws for unknown name");

			unsub();
			conn.close();

			threw = false;
			try {
				await conn.call({
					path: "/org/freedesktop/DBus",
					interface: "org.freedesktop.DBus",
					member: "ListNames",
					destination: "org.freedesktop.DBus",
				});
			} catch (e) {
				threw = true;
				assert(/closed/i.test(e.message), "call after close mentions closed");
			}
			assert(threw, "call after close throws");

		} finally {
			if (daemon) {
				try { process.kill(daemon, "SIGTERM"); } catch (_) {}
			}
			try { require("fs").unlinkSync(sockPath); } catch (_) {}
		}

		log("OK\n");
		return true;
	}

	function testFfiLibc() {
		log("  ffi libc... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }
		if (process.platform !== "linux") { log("(skip: non-linux)\n"); return true; }

		// Exercise the libc lazy-open path in ffi/libc.ts.  Used by
		// nolib/memory.ts via lib/ffi/bun.ts's bp() for memory_bufferAddress.
		var libcMod = require("../lib/ffi/libc");
		var lc = libcMod.libc();
		assert(lc !== null, "libc() resolves on Linux/Bun");
		assert(typeof lc.open === "function", "libc has open");
		assert(typeof lc.close === "function", "libc has close");
		assert(typeof lc.ioctl === "function", "libc has ioctl");
		assert(typeof lc.mmap === "function", "libc has mmap");

		var ffi = libcMod.libcFFI();
		assert(ffi !== null, "libcFFI() resolves");

		var reason = libcMod.libcOpenReason();
		assert(reason === null, "libcOpenReason null on success");

		// Constants exist
		assert(libcMod.O_RDWR === 2, "O_RDWR");
		assert(typeof libcMod.PROT_READ === "number", "PROT_READ");
		assert(typeof libcMod.MAP_FAILED === "bigint", "MAP_FAILED");

		log("OK\n");
		return true;
	}

	function testPortalUtil() {
		log("  portal util... ");
		var IS_BUN = typeof globalThis.Bun !== "undefined";
		if (!IS_BUN) { log("(skip: node)\n"); return true; }

		var util = require("../lib/portal/util");

		// requestPath: pure string manipulation, no D-Bus needed
		var mockConn = { getUniqueName: function () { return ":1.42"; } };
		var rp = util.requestPath(mockConn, "test_token");
		assert(rp === "/org/freedesktop/portal/desktop/request/1_42/test_token",
			"requestPath builds correct path");

		log("OK\n");
		return true;
	}

	return [
		{ name: "tokens", functions: [], unit: true, test: testTokens },
		{ name: "installer coverage", functions: [], unit: true, test: testInstallerCoverage },
		{ name: "gext token", functions: [], unit: true, test: testGextWindowAccessors },
		{ name: "atspi avail", functions: [], unit: true, test: testAtSpiAvailability },
		{ name: "remote-desktop", functions: [], unit: true, test: testRemoteDesktop },
		{ name: "dbus wire", functions: [], unit: true, test: testDbusWire },
		{ name: "dbus connection", functions: [], unit: true, test: testDbusConnection },
		{ name: "ffi libc", functions: [], unit: true, test: testFfiLibc },
		{ name: "portal util", functions: [], unit: true, test: testPortalUtil },
		{ name: "platform api", functions: [], unit: true, test: testPlatformApi },
	];
};
