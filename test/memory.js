////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Memory Test Module                             //
//                                                                            //
//  Exercises Memory and Module classes using the modern mechatron API.       //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip) {

	async function testMemory() {
		log("  Memory... ");

		var Module  = mechatron.Module;
		var Process = mechatron.Process;
		var Memory  = mechatron.Memory;

		// --- Segment (data type) ---
		var Segment = mechatron.Segment;
		if (Segment) {
			var seg = new Segment();
			assert(seg.valid === false, "empty segment invalid");
			assert(seg.base === 0, "empty segment base");
			assert(seg.size === 0, "empty segment size");
			assert(seg.name === "", "empty segment name");

			// Segment contains
			seg.base = 100; seg.size = 50;
			assert(seg.contains(100), "segment contains start");
			assert(seg.contains(149), "segment contains end-1");
			assert(!seg.contains(150), "segment !contains end");
			assert(!seg.contains(99), "segment !contains before");

			// Segment comparisons
			var seg2 = new Segment();
			seg2.base = 200; seg2.size = 10;
			assert(seg.lt(seg2), "segment lt");
			assert(!seg.gt(seg2), "segment !gt");
			assert(seg.le(seg2), "segment le");
			assert(!seg.ge(seg2), "segment !ge");
			assert(seg.lt(200), "segment lt number");
			assert(seg.le(100), "segment le number");

			// Segment eq/ne
			var seg3 = seg.clone();
			assert(seg3.eq(seg), "segment clone eq");
			assert(!seg3.ne(seg), "segment clone !ne");
			assert(seg.ne(seg2), "segment ne different");

			// Segment TypeError branches
			var segThrew = false;
			try { seg.lt("bad"); } catch(e) { segThrew = true; }
			assert(segThrew, "segment lt invalid throws");
			segThrew = false;
			try { seg.gt("bad"); } catch(e) { segThrew = true; }
			assert(segThrew, "segment gt invalid throws");
			segThrew = false;
			try { seg.le("bad"); } catch(e) { segThrew = true; }
			assert(segThrew, "segment le invalid throws");
			segThrew = false;
			try { seg.ge("bad"); } catch(e) { segThrew = true; }
			assert(segThrew, "segment ge invalid throws");

			// Segment static compare
			assert(Segment.compare(seg, seg2) === -1, "Segment.compare lt");
			assert(Segment.compare(seg2, seg) === 1, "Segment.compare gt");
			assert(Segment.compare(seg, seg) === 0, "Segment.compare eq");
		}

		// --- Module (data type only) ---
		var mod = new Module();
		assert(mod.valid === false, "empty module invalid");
		assert(mod.name === "", "empty module name");
		assert(mod.base === 0, "empty module base");
		assert(mod.size === 0, "empty module size");
		assert(mod.isValid() === false, "empty module isValid");
		assert(mod.getName() === "", "empty module getName");
		assert(mod.getPath() === "", "empty module getPath");
		assert(mod.getBase() === 0, "empty module getBase");
		assert(mod.getSize() === 0, "empty module getSize");
		assert(mod.getProcess() instanceof Process, "empty module getProcess");
		assert(mod.contains(0) === false, "empty module !contains 0");
		assert(mod.getSegments().length === 0, "empty module getSegments empty");

		// Module comparisons
		assert(mod.eq(0), "empty module eq 0");
		assert(mod.ne(1), "empty module ne 1");
		assert(mod.lt(1), "empty module lt 1");
		assert(!mod.gt(1), "empty module !gt 1");
		assert(mod.le(0), "empty module le 0");
		assert(mod.ge(0), "empty module ge 0");

		// Module clone
		var modCl = mod.clone();
		assert(modCl.eq(mod), "module clone eq");
		assert(modCl.getName() === mod.getName(), "module clone name");

		// Module static compare
		assert(Module.compare(mod, modCl) === 0, "Module.compare eq");

		// --- Invalid memory ---
		var mem = new Memory();
		assert(!mem.isValid(), "empty invalid");

		var proc = new Process();
		mem = new Memory(proc);
		assert(!mem.isValid(), "invalid proc -> invalid mem");
		assert(mem.getProcess().eq(proc), "getProcess eq");

		// Invalid reads/writes
		var buf = Buffer.alloc(1);
		assert(mem.readData(0, buf, 1) === 0, "invalid readData");
		assert(mem.writeData(0, buf, 1) === 0, "invalid writeData");

		// Invalid regions
		assert(!mem.getRegion(0).valid, "invalid getRegion 0");
		assert(mem.getRegions().length === 0, "invalid getRegions empty");

		// Invalid find
		assert(mem.find("  ").length === 0, "invalid find empty");

		// --- Open current process ---
		proc = Process.getCurrent();
		mem = new Memory(proc);
		assert(mem.isValid(), "current mem valid");

		// Ptr size
		var ptrSize = mem.getPtrSize();
		assert(ptrSize === 4 || ptrSize === 8, "ptrSize 4 or 8");

		// Min/max address, page size
		var minAddr = mem.getMinAddress();
		var maxAddr = mem.getMaxAddress();
		var pageSize = mem.getPageSize();
		assert(minAddr >= 0, "minAddress >= 0");
		assert(maxAddr > 0, "maxAddress > 0");
		assert(maxAddr > minAddr, "maxAddress > minAddress");
		assert(pageSize > 0, "pageSize > 0");

		// --- Regions and read operations ---
		var regions = mem.getRegions();
		assert(regions.length > 0, "regions non-empty");

		// Find a readable region
		var readable = null;
		for (var i = 0; i < regions.length; ++i) {
			if (regions[i].valid && regions[i].bound && regions[i].readable && regions[i].size > 16) {
				readable = regions[i];
				break;
			}
		}

		assert(readable !== null, "found readable region");

		// --- Read from readable region ---
		buf = Buffer.alloc(16);
		var bytesRead = mem.readData(readable.start, buf, 16);
		assert(bytesRead === 16, "readData 16 bytes");

		// --- getRegion for known address ---
		var region = mem.getRegion(readable.start);
		assert(region.valid, "getRegion valid");
		assert(region.bound, "getRegion bound");
		assert(region.readable, "getRegion readable");

		// --- Stats ---
		var stats = mem.getStats();
		assert(typeof stats === "object", "getStats object");
		var stats2 = stats.clone();
		assert(stats2.eq(stats), "stats clone eq");
		assert(!stats2.ne(stats), "stats clone !ne");

		// --- Region properties ---
		var region0 = regions[0];
		assert(typeof region0.valid === "boolean", "region valid bool");
		assert(typeof region0.bound === "boolean", "region bound bool");
		assert(typeof region0.start === "number", "region start number");
		assert(typeof region0.size === "number", "region size number");
		assert(typeof region0.readable === "boolean", "region readable bool");
		assert(typeof region0.writable === "boolean", "region writable bool");
		if (region0.valid && region0.size > 0) {
			assert(region0.contains(region0.start), "region contains start");
			assert(!region0.contains(region0.start + region0.size), "region !contains end");
		}

		// Region comparisons
		if (regions.length > 1) {
			var r0 = regions[0], r1 = regions[1];
			assert(typeof r0.lt(r1) === "boolean", "region lt");
			assert(typeof r0.gt(r1) === "boolean", "region gt");
			assert(typeof r0.le(r1) === "boolean", "region le");
			assert(typeof r0.ge(r1) === "boolean", "region ge");
			assert(typeof r0.eq(r1) === "boolean", "region eq");
			assert(typeof r0.ne(r1) === "boolean", "region ne");
			var rcl = r0.clone();
			assert(rcl.eq(r0), "region clone eq");
		}

		// --- Cache operations ---
		assert(typeof mem.isCaching() === "boolean", "isCaching bool");
		assert(typeof mem.getCacheSize() === "number", "getCacheSize number");
		// Always exercise clearCache/deleteCache (no-op when not caching)
		mem.clearCache();
		mem.deleteCache();
		if (readable) {
			var cached = mem.createCache(readable.start, readable.size, 4096);
			assert(typeof cached === "boolean", "createCache returns boolean");
			if (cached) {
				assert(mem.isCaching(), "isCaching after createCache");
				assert(mem.getCacheSize() > 0, "getCacheSize > 0");
				mem.clearCache();
				mem.deleteCache();
				assert(!mem.isCaching(), "!isCaching after deleteCache");
			}
		}

		// Modules of current process
		var mods = proc.getModules();
		assert(mods.length > 0, "current proc has modules");

		// --- Memory copy constructor ---
		var memCopy = new Memory(mem);
		assert(memCopy.isValid(), "Memory copy ctor valid");

		// --- Region eq/ne/lt/gt/le/ge with numbers and TypeError ---
		if (regions.length > 0) {
			var reg0 = regions[0];
			assert(typeof reg0.eq(reg0.start) === "boolean", "Region eq number");
			assert(typeof reg0.ne(reg0.start) === "boolean", "Region ne number");
			assert(typeof reg0.lt(reg0.start) === "boolean", "Region lt number");
			assert(typeof reg0.gt(reg0.start) === "boolean", "Region gt number");
			assert(typeof reg0.le(reg0.start) === "boolean", "Region le number");
			assert(typeof reg0.ge(reg0.start) === "boolean", "Region ge number");
			var regThrew = false;
			try { reg0.eq("bad"); } catch(e) { regThrew = true; }
			assert(regThrew, "Region eq invalid throws");
			regThrew = false;
			try { reg0.ne("bad"); } catch(e) { regThrew = true; }
			assert(regThrew, "Region ne invalid throws");
			regThrew = false;
			try { reg0.lt("bad"); } catch(e) { regThrew = true; }
			assert(regThrew, "Region lt invalid throws");
			regThrew = false;
			try { reg0.gt("bad"); } catch(e) { regThrew = true; }
			assert(regThrew, "Region gt invalid throws");
			regThrew = false;
			try { reg0.le("bad"); } catch(e) { regThrew = true; }
			assert(regThrew, "Region le invalid throws");
			regThrew = false;
			try { reg0.ge("bad"); } catch(e) { regThrew = true; }
			assert(regThrew, "Region ge invalid throws");

			// Region static compare
			if (regions.length > 1) {
				var cmp = regions[0].clone();
				assert(typeof Memory.Region.compare(regions[0], regions[1]) === "number", "Region.compare");
				// Test equal case
				assert(Memory.Region.compare(cmp, regions[0]) === 0, "Region.compare eq");
			}
		}

		// --- Memory clone ---
		var memCl = mem.clone();
		assert(memCl.isValid(), "clone valid");
		assert(memCl.getProcess().eq(proc), "clone getProcess eq");

		// --- Cross-process memory write verification ---
		// Spawn a compiled native helper (see test/memory-child.c) that
		// allocates a random buffer internally and emits a fresh hex
		// dump of it on stdout every time the parent writes a newline
		// to its stdin.  mechatron attaches to the helper's address
		// space via the Memory API and performs round-trip writes/reads;
		// the child's own view is verified by prompting it to re-dump
		// the buffer after each round of writes.
		//
		// Rationale for using a native binary (not `node`) as the target:
		// on macOS, the official Node.js binary ships with the hardened
		// runtime enabled, which makes task_for_pid() deny access unless
		// the target is re-signed with com.apple.security.get-task-allow.
		// A plain compiled binary is not hardened by default, so it
		// stands in for the real-world "game trainer" scenario in which
		// the user disables SIP or enables Developer Mode to allow
		// debugging third-party same-user processes — the net effect of
		// either of those is exactly what we get here by targeting a
		// non-hardened binary.
		var _cp = require("child_process");
		var _path = require("path");

		var _helperExt = process.platform === "win32" ? ".exe" : "";
		var _helper = _path.join(__dirname, "memory-child" + _helperExt);

		// stdin/stdout: piped line protocol.  stderr: inherited so any
		// helper panics surface directly in the test log.
		var _child = _cp.spawn(_helper, [],
			{ stdio: ["pipe", "pipe", "inherit"] });

		// Line-oriented reader over the child's stdout.  In normal
		// lockstep use, there is at most one outstanding waiter and the
		// child emits exactly one line per newline we write — but any
		// extra lines are queued defensively so nothing is silently
		// dropped.
		var _lineQueue = [];
		var _lineWaiter = null;
		var _childClosed = false;
		var _stdoutBuf = "";
		_child.stdout.setEncoding("utf8");
		_child.stdout.on("data", function (chunk) {
			_stdoutBuf += chunk;
			var nl;
			while ((nl = _stdoutBuf.indexOf("\n")) >= 0) {
				var line = _stdoutBuf.slice(0, nl).replace(/\r$/, "");
				_stdoutBuf = _stdoutBuf.slice(nl + 1);
				if (_lineWaiter) {
					var w = _lineWaiter; _lineWaiter = null;
					w(line);
				} else {
					_lineQueue.push(line);
				}
			}
		});
		_child.on("exit", function () { _childClosed = true; });

		function _queryChild() {
			return new Promise(function (resolve, reject) {
				if (_lineQueue.length > 0) return resolve(_lineQueue.shift());
				if (_childClosed) return reject(new Error("child closed"));
				var t = setTimeout(function () {
					_lineWaiter = null;
					reject(new Error("child stdout read timeout"));
				}, 5000);
				_lineWaiter = function (line) {
					clearTimeout(t);
					resolve(line);
				};
				_child.stdin.write("\n");
			});
		}

		try {
			// First query doubles as the readiness probe and returns
			// the child's self-generated initial buffer contents.
			var _initialHex = await _queryChild();
			assert(/^[0-9a-f]{128}$/.test(_initialHex),
				"native helper emitted 64-byte hex dump");

			var childProc = new Process();
			assert(childProc.open(_child.pid), "open child process");
			var childMem = new Memory(childProc);
			assert(childMem.isValid(), "child Memory valid");
			assert(childMem.getProcess().getPID() === _child.pid,
				"child Memory attached to correct pid");

			// Locate the buffer via a content search on the known needle.
			var _needle = _initialHex.substring(0, 32).match(/../g).join(" ");
			var _addrs = childMem.find(_needle, undefined, undefined, 1);
			assert(_addrs.length > 0, "child sentinel found via find()");
			var wa = _addrs[0];

			// Write various types at non-overlapping offsets, then verify
			// via a single query that the child process sees them all.
			//   [0]     writeInt8(0x42)
			//   [2-3]   writeInt16(0x1234)
			//   [4-7]   writeInt32(0x12345678)
			//   [8]     writeBool(true)
			//   [16-23] writeInt64(0x1122)
			//   [24-25] writeString("Hi")
			//   [28-31] writeReal32(1.5)
			//   [32-39] writeReal64(2.5)
			//   [40-47] writePtr(0x1234)
			assert(childMem.writeInt8(wa, 0x42),
				"cross-process writeInt8 succeeded");
			childMem.writeInt16(wa + 2, 0x1234);
			childMem.writeInt32(wa + 4, 0x12345678);
			childMem.writeBool(wa + 8, true);
			childMem.writeInt64(wa + 16, 0x1122);
			childMem.writeString(wa + 24, "Hi");
			childMem.writeReal32(wa + 28, 1.5);
			childMem.writeReal64(wa + 32, 2.5);
			childMem.writePtr(wa + 40, 0x1234);

			// Read back via typed read methods (cross-process read).
			assert(childMem.readInt8(wa) === 0x42,
				"cross-process readInt8");
			assert(childMem.readInt16(wa + 2) === 0x1234,
				"cross-process readInt16");
			assert(childMem.readInt32(wa + 4) === 0x12345678,
				"cross-process readInt32");
			assert(childMem.readBool(wa + 8) === true,
				"cross-process readBool");
			assert(childMem.readInt64(wa + 16) === 0x1122,
				"cross-process readInt64");
			assert(childMem.readString(wa + 24, 2) === "Hi",
				"cross-process readString");
			assert(childMem.readReal32(wa + 28) === 1.5,
				"cross-process readReal32");
			assert(childMem.readReal64(wa + 32) === 2.5,
				"cross-process readReal64");
			assert(childMem.readPtr(wa + 40) === 0x1234,
				"cross-process readPtr");

			// Belt-and-suspenders: ask the child to re-dump its buffer.
			// The child uses volatile reads so the values we see here are
			// the actual bytes in its address space, not a stale cache.
			var _hex = await _queryChild();
			assert(_hex.substring(0, 2) === "42",
				"cross-process writeInt8 visible");
			assert(_hex.substring(4, 8) === "3412",
				"cross-process writeInt16 visible");
			assert(_hex.substring(8, 16) === "78563412",
				"cross-process writeInt32 visible");
			assert(_hex.substring(16, 18) === "01",
				"cross-process writeBool visible");
			assert(_hex.substring(32, 36) === "2211",
				"cross-process writeInt64 visible");
			assert(_hex.substring(48, 52) === "4869",
				"cross-process writeString visible");
			assert(_hex.substring(56, 64) === "0000c03f",
				"cross-process writeReal32 visible");
			assert(_hex.substring(64, 80) === "0000000000000440",
				"cross-process writeReal64 visible");

			// Round 2: negative / signed values
			childMem.writeData(wa, Buffer.alloc(64, 0xA5), 64);
			childMem.writeInt8(wa, -1);           // ff
			childMem.writeInt16(wa + 2, -2);      // fe ff
			childMem.writeInt32(wa + 4, -3);      // fd ff ff ff
			childMem.writeInt64(wa + 16, -4);     // fc ff ff ff ff ff ff ff

			// Read back via typed read methods — verify sign is preserved
			assert(childMem.readInt8(wa) === -1,
				"cross-process readInt8 negative");
			assert(childMem.readInt16(wa + 2) === -2,
				"cross-process readInt16 negative");
			assert(childMem.readInt32(wa + 4) === -3,
				"cross-process readInt32 negative");
			assert(childMem.readInt64(wa + 16) === -4,
				"cross-process readInt64 negative");

			// Verify the same via child's own view
			_hex = await _queryChild();
			assert(_hex.substring(0, 2) === "ff",
				"cross-process writeInt8 negative visible");
			assert(_hex.substring(4, 8) === "feff",
				"cross-process writeInt16 negative visible");
			assert(_hex.substring(8, 16) === "fdffffff",
				"cross-process writeInt32 negative visible");
			assert(_hex.substring(32, 48) === "fcffffffffffffff",
				"cross-process writeInt64 negative visible");

			// Restore original fill
			childMem.writeData(wa, Buffer.alloc(64, 0xA5), 64);
			_hex = await _queryChild();
			assert(_hex.substring(0, 2) === "a5",
				"cross-process writeData restore visible");

			childProc.close();
		} finally {
			// Closing stdin is the child's cue to exit cleanly on EOF.
			try { _child.stdin.end(); } catch (_) {}
			try { _child.kill(); } catch (_) {}
		}

		// --- Multi-value (count > 1) typed reads ---
		if (readable && readable.size >= 32) {
			var mv8 = mem.readInt8(readable.start, 4);
			assert(Array.isArray(mv8), "readInt8 count=4 returns array");
			assert(mv8.length === 4, "readInt8 count=4 length");
			var mv16 = mem.readInt16(readable.start, 2);
			assert(Array.isArray(mv16), "readInt16 count=2 returns array");
			var mv32 = mem.readInt32(readable.start, 2);
			assert(Array.isArray(mv32), "readInt32 count=2 returns array");
			var mvr32 = mem.readReal32(readable.start, 2);
			assert(Array.isArray(mvr32), "readReal32 count=2 returns array");
			var mvr64 = mem.readReal64(readable.start, 2);
			assert(Array.isArray(mvr64), "readReal64 count=2 returns array");
			var mvb = mem.readBool(readable.start, 4);
			assert(Array.isArray(mvb), "readBool count=4 returns array");
			var mvs = mem.readString(readable.start, 4, 2);
			assert(Array.isArray(mvs), "readString count=2 returns array");
			var mv64 = mem.readInt64(readable.start, 2);
			assert(Array.isArray(mv64), "readInt64 count=2 returns array");
			var mvp = mem.readPtr(readable.start, 2);
			assert(Array.isArray(mvp), "readPtr count=2 returns array");

			// Multi-value with stride
			var mvStride = mem.readInt8(readable.start, 2, 4);
			assert(Array.isArray(mvStride), "readInt8 with stride returns array");
		}

		// --- setAccess both overloads ---
		if (readable) {
			var access = mem.setAccess(readable, readable.readable, readable.writable, readable.executable);
			assert(typeof access === "boolean", "setAccess rwx returns bool");
			var accessFlags = mem.setAccess(readable, readable.access);
			assert(typeof accessFlags === "boolean", "setAccess flags returns bool");
		}

		// --- writeDataAsync ---
		var pa4 = mem.writeDataAsync(0, Buffer.alloc(1), 1);
		assert(pa4 instanceof Promise, "writeDataAsync returns Promise");

		// --- Async variants ---
		var pa1 = mem.getRegionsAsync();
		assert(pa1 instanceof Promise, "getRegionsAsync returns Promise");
		var pa2 = mem.readDataAsync(0, Buffer.alloc(1), 1);
		assert(pa2 instanceof Promise, "readDataAsync returns Promise");
		var pa3 = mem.findAsync("  ");
		assert(pa3 instanceof Promise, "findAsync returns Promise");

		proc.close();

		log("OK\n");
		return true;
	}

	return {
		testMemory: testMemory,
	};
};
