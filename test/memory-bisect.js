// Bisection harness for the ia32 shutdown-segfault bug.
//
// Each "case" exercises ONE memory operation (or small set) and exits.
// The CI crash-bait loop runs each case in its own loop of N iterations
// to identify which operation triggers the crash.
//
// Usage:  node test/memory-bisect.js <case-name>  [--backend napi|ffi]
// Cases:  load, mem-current, info, getRegions, getRegion,
//         readData-default, readData-skiperr, readData-autoaccess,
//         writeData-default, writeData-autoaccess, find, setAccess.

"use strict";

var _backendIdx = process.argv.indexOf("--backend");
var _backend = _backendIdx >= 0 ? process.argv[_backendIdx + 1] : "napi";
process.env.MECHATRON_BACKEND = _backend;

var caseName = process.argv[2];
if (!caseName || caseName.startsWith("--")) {
	process.stderr.write("usage: node test/memory-bisect.js <case>\n");
	process.exit(2);
}

var mechatron = require("..");
var Process = mechatron.Process;
var Memory  = mechatron.Memory;

function pickReadable(regions) {
	for (var i = 0; i < regions.length; ++i) {
		var r = regions[i];
		if (r.valid && r.bound && r.readable && r.size > 16n) return r;
	}
	return null;
}

async function withChild(fn) {
	var cp   = require("child_process");
	var path = require("path");
	var ext  = process.platform === "win32" ? ".exe" : "";
	var bin  = path.join(__dirname, "memory-child" + ext);
	var child = cp.spawn(bin, [], { stdio: ["pipe", "pipe", "inherit"] });

	var queue = [], waiter = null, closed = false, sbuf = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", function (chunk) {
		sbuf += chunk;
		var nl;
		while ((nl = sbuf.indexOf("\n")) >= 0) {
			var line = sbuf.slice(0, nl).replace(/\r$/, "");
			sbuf = sbuf.slice(nl + 1);
			if (waiter) { var w = waiter; waiter = null; w(line); }
			else queue.push(line);
		}
	});
	child.on("exit", function () { closed = true; });

	function query() {
		return new Promise(function (resolve, reject) {
			if (queue.length > 0) return resolve(queue.shift());
			if (closed) return reject(new Error("child closed"));
			var t = setTimeout(function () {
				waiter = null;
				reject(new Error("child stdout timeout"));
			}, 5000);
			waiter = function (line) { clearTimeout(t); resolve(line); };
			child.stdin.write("\n");
		});
	}

	try {
		return await fn(child, query);
	} finally {
		try { child.stdin.end(); } catch (_) {}
		try { child.kill(); } catch (_) {}
	}
}

var cases = {
	"load": async function () {
		// Just loading mechatron is enough — already done at top.
	},

	"mem-current": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		if (!await mem.isValid()) throw new Error("mem invalid");
		await proc.close();
	},

	"info": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		await mem.getPtrSize();
		await mem.getMinAddress();
		await mem.getMaxAddress();
		await mem.getPageSize();
		await proc.close();
	},

	"getRegions": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		if (regions.length === 0) throw new Error("no regions");
		await proc.close();
	},

	"getRegion": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		await mem.getRegion(r.start);
		await proc.close();
	},

	"readData-default": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		var buf = Buffer.alloc(16);
		await mem.readData(r.start, buf, 16);
		await proc.close();
	},

	"readData-skiperr": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		var len = Number(r.size * 2n < 1048576n ? r.size * 2n : 1048576n);
		var buf = Buffer.alloc(len);
		await mem.readData(r.start, buf, len, Memory.SKIP_ERRORS);
		await proc.close();
	},

	"readData-autoaccess": async function () {
		// SUSPECTED CULPRIT: AUTO_ACCESS makes our Rust code call
		// VirtualProtectEx on adjacent non-readable regions (V8 guard
		// pages, JIT code pages) within the requested span.
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		var len = Number(r.size * 2n < 1048576n ? r.size * 2n : 1048576n);
		var buf = Buffer.alloc(len);
		await mem.readData(r.start, buf, len, Memory.AUTO_ACCESS);
		await proc.close();
	},

	"writeData-default": async function () {
		await withChild(async function (child) {
			var childProc = new Process();
			if (!childProc.open(child.pid)) throw new Error("open child");
			var mem = new Memory(childProc);
			var regions = await mem.getRegions();
			var w = null;
			for (var i = 0; i < regions.length; ++i) {
				if (regions[i].valid && regions[i].bound &&
				    regions[i].writable && regions[i].size > 16n) {
					w = regions[i]; break;
				}
			}
			if (!w) throw new Error("no writable region in child");
			var buf = Buffer.alloc(16);
			await mem.writeData(w.start, buf, 16);
			await childProc.close();
		});
	},

	"writeData-autoaccess": async function () {
		await withChild(async function (child) {
			var childProc = new Process();
			if (!childProc.open(child.pid)) throw new Error("open child");
			var mem = new Memory(childProc);
			var regions = await mem.getRegions();
			var w = null;
			for (var i = 0; i < regions.length; ++i) {
				if (regions[i].valid && regions[i].bound &&
				    regions[i].writable && regions[i].size > 16n) {
					w = regions[i]; break;
				}
			}
			if (!w) throw new Error("no writable region in child");
			var buf = Buffer.alloc(16);
			await mem.writeData(w.start, buf, 16, Memory.AUTO_ACCESS);
			await childProc.close();
		});
	},

	"find": async function () {
		await withChild(async function (child, query) {
			var hex = await query();
			var needle = hex.substring(0, 16); // first 8 bytes as hex pairs
			// reformat for find pattern: "ab cd ef..."
			var pattern = "";
			for (var i = 0; i < needle.length; i += 2) {
				if (i > 0) pattern += " ";
				pattern += needle.substring(i, i + 2);
			}
			var childProc = new Process();
			if (!childProc.open(child.pid)) throw new Error("open child");
			var mem = new Memory(childProc);
			await mem.find(pattern, undefined, undefined, 1);
			await childProc.close();
		});
	},

	"setAccess": async function () {
		// Self-process setAccess — the original test pattern that
		// my earlier diagnostic skipped on win32.  Run it explicitly.
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		await mem.setAccess(r, r.readable, r.writable, r.executable);
		await proc.close();
	},

	// Combination cases — none of the individual ops above crashed,
	// so the trigger must be cumulative / sequential.

	"all-reads": async function () {
		// Run every read variant on self.
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		var len = Number(r.size * 2n < 1048576n ? r.size * 2n : 1048576n);
		var buf = Buffer.alloc(len);
		await mem.readData(r.start, buf, 16);
		await mem.readData(r.start, buf, len, Memory.SKIP_ERRORS);
		await mem.readData(r.start, buf, len, Memory.AUTO_ACCESS);
		await mem.readInt8(r.start);
		await mem.readInt16(r.start);
		await mem.readInt32(r.start);
		await mem.readInt64(r.start);
		await mem.readReal32(r.start);
		await mem.readReal64(r.start);
		await proc.close();
	},

	"multi-reads": async function () {
		// count>1 typed reads — these create arrays of values.
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r || r.size < 32n) throw new Error("no big readable region");
		await mem.readInt8(r.start, 4);
		await mem.readInt16(r.start, 2);
		await mem.readInt32(r.start, 2);
		await mem.readReal32(r.start, 2);
		await mem.readReal64(r.start, 2);
		await mem.readBool(r.start, 4);
		await mem.readInt8(r.start, 2, 4); // with stride
		await proc.close();
	},

	"setAccess-then-autoaccess": async function () {
		// setAccess on self followed by AUTO_ACCESS read across regions.
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		await mem.setAccess(r, r.readable, r.writable, r.executable);
		var len = Number(r.size * 2n < 1048576n ? r.size * 2n : 1048576n);
		await mem.readData(r.start, Buffer.alloc(len), len, Memory.AUTO_ACCESS);
		await proc.close();
	},

	"full": async function () {
		// Control case: run the actual test/memory.js test functions.
		// If this crashes but individual cases don't, the trigger is
		// in the cumulative/combination pattern.
		var path = require("path");
		var assert = function (c, msg) { if (!c) throw new Error(msg || "assert"); };
		var log = function (s) { process.stdout.write(s); };
		var waitFor = function () {};
		var waitForAsync = function () {};
		var entries = require("./memory")(mechatron, log, assert, waitFor, waitForAsync);
		for (var i = 0; i < entries.length; ++i) {
			await entries[i].test();
		}
	},

	// Heavy in-process cumulative cases — many ops in one process to
	// build up GC pressure / JIT compilation pressure / napi state
	// in the same way the full memory test does.

	"many-reads-x100": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		var buf = Buffer.alloc(64);
		for (var i = 0; i < 100; ++i) {
			await mem.readData(r.start, buf, 64);
		}
		await proc.close();
	},

	"many-autoaccess-x50": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r) throw new Error("no readable region");
		var len = Number(r.size * 2n < 1048576n ? r.size * 2n : 1048576n);
		var buf = Buffer.alloc(len);
		for (var i = 0; i < 50; ++i) {
			await mem.readData(r.start, buf, len, Memory.AUTO_ACCESS);
		}
		await proc.close();
	},

	"many-getRegions-x50": async function () {
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		for (var i = 0; i < 50; ++i) {
			await mem.getRegions();
		}
		await proc.close();
	},

	"many-typed-x100": async function () {
		// Lots of typed reads (each creates a Buffer or array internally).
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		var regions = await mem.getRegions();
		var r = pickReadable(regions);
		if (!r || r.size < 64n) throw new Error("no big readable region");
		for (var i = 0; i < 100; ++i) {
			await mem.readInt8(r.start);
			await mem.readInt32(r.start);
			await mem.readReal64(r.start);
		}
		await proc.close();
	},
};

(async function () {
	var fn = cases[caseName];
	if (!fn) {
		process.stderr.write("Unknown case: " + caseName + "\n");
		process.stderr.write("Available: " + Object.keys(cases).join(", ") + "\n");
		process.exit(2);
	}
	try {
		await fn();
		process.stdout.write("OK\n");
		process.exit(0);
	} catch (e) {
		process.stderr.write("FAIL: " + (e.stack || e.message) + "\n");
		process.exit(1);
	}
})();
