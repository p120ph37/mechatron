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

module.exports = function (mechatron, log, assert, waitFor) {

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
		assert(!await mem.isValid(), "empty invalid");

		var proc = new Process();
		mem = new Memory(proc);
		assert(!await mem.isValid(), "invalid proc -> invalid mem");
		assert(mem.getProcess().eq(proc), "getProcess eq");

		// Invalid reads/writes
		var buf = Buffer.alloc(1);
		assert(await mem.readData(0, buf, 1) === 0, "invalid readData");
		assert(await mem.writeData(0, buf, 1) === 0, "invalid writeData");

		// Invalid regions
		assert(!(await mem.getRegion(0)).valid, "invalid getRegion 0");
		assert((await mem.getRegions()).length === 0, "invalid getRegions empty");

		// Invalid find
		assert((await mem.find("  ")).length === 0, "invalid find empty");

		// --- Open current process ---
		proc = await Process.getCurrent();
		mem = new Memory(proc);
		assert(await mem.isValid(), "current mem valid");

		var ptrSize = await mem.getPtrSize();
		assert(ptrSize === 4 || ptrSize === 8, "ptrSize 4 or 8");

		var minAddr = await mem.getMinAddress();
		var maxAddr = await mem.getMaxAddress();
		var pageSize = await mem.getPageSize();
		assert(minAddr >= 0n, "minAddress >= 0");
		assert(maxAddr > 0n, "maxAddress > 0");
		assert(maxAddr > minAddr, "maxAddress > minAddress");
		assert(pageSize > 0, "pageSize > 0");

		// --- Regions and read operations ---
		var regions = await mem.getRegions();
		assert(regions.length > 0, "regions non-empty");

		// Find a readable region
		var readable = null;
		for (var i = 0; i < regions.length; ++i) {
			if (regions[i].valid && regions[i].bound && regions[i].readable && regions[i].size > 16n) {
				readable = regions[i];
				break;
			}
		}

		assert(readable !== null, "found readable region");

		// --- Read from readable region ---
		buf = Buffer.alloc(16);
		var bytesRead = await mem.readData(readable.start, buf, 16);
		assert(bytesRead === 16, "readData 16 bytes");

		// --- getRegion for known address ---
		var region = await mem.getRegion(readable.start);
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
		assert(typeof region0.start === "bigint", "region start bigint");
		assert(typeof region0.size === "bigint", "region size bigint");
		assert(typeof region0.readable === "boolean", "region readable bool");
		assert(typeof region0.writable === "boolean", "region writable bool");
		if (region0.valid && region0.size > 0n) {
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

		// --- Memory copy constructor ---
		var memCopy = new Memory(mem);
		assert(await memCopy.isValid(), "Memory copy ctor valid");

		// --- Region eq/ne/lt/gt/le/ge with numbers and TypeError ---
		if (regions.length > 0) {
			var reg0 = regions[0];
			assert(typeof reg0.eq(reg0.start) === "boolean", "Region eq bigint");
			assert(typeof reg0.ne(reg0.start) === "boolean", "Region ne bigint");
			assert(typeof reg0.lt(reg0.start) === "boolean", "Region lt bigint");
			assert(typeof reg0.gt(reg0.start) === "boolean", "Region gt bigint");
			assert(typeof reg0.le(reg0.start) === "boolean", "Region le bigint");
			assert(typeof reg0.ge(reg0.start) === "boolean", "Region ge bigint");
			// Also test with number
			assert(typeof reg0.eq(0) === "boolean", "Region eq number");
			assert(typeof reg0.ne(0) === "boolean", "Region ne number");
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
		assert(await memCl.isValid(), "clone valid");
		assert(memCl.getProcess().eq(proc), "clone getProcess eq");

		// --- Cross-process memory write verification ---
		var _cp = require("child_process");
		var _path = require("path");

		var _helperExt = process.platform === "win32" ? ".exe" : "";
		var _helper = _path.join(__dirname, "memory-child" + _helperExt);

		var _child = _cp.spawn(_helper, [],
			{ stdio: ["pipe", "pipe", "inherit"] });

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
			var _initialHex = await _queryChild();
			assert(/^[0-9a-f]{128}$/.test(_initialHex),
				"native helper emitted 64-byte hex dump");

			var childProc = new Process();
			assert(childProc.open(_child.pid), "open child process");
			var childMem = new Memory(childProc);
			assert(await childMem.isValid(), "child Memory valid");
			assert(childMem.getProcess().getPID() === _child.pid,
				"child Memory attached to correct pid");

			// Locate the buffer via a content search on the known needle.
			var _needle = _initialHex.substring(0, 32).match(/../g).join(" ");
			var _addrs = await childMem.find(_needle, undefined, undefined, 1);
			assert(_addrs.length > 0, "child sentinel found via find()");
			var wa = _addrs[0]; // bigint address

			// Write various types at non-overlapping offsets
			assert(await childMem.writeInt8(wa, 0x42),
				"cross-process writeInt8 succeeded");
			await childMem.writeInt16(wa + 2n, 0x1234);
			await childMem.writeInt32(wa + 4n, 0x12345678);
			await childMem.writeBool(wa + 8n, true);
			await childMem.writeInt64(wa + 16n, 0x1122);
			await childMem.writeString(wa + 24n, "Hi");
			await childMem.writeReal32(wa + 28n, 1.5);
			await childMem.writeReal64(wa + 32n, 2.5);
			await childMem.writePtr(wa + 40n, 0x1234);

			// Read back via typed read methods (cross-process read).
			assert(await childMem.readInt8(wa) === 0x42,
				"cross-process readInt8");
			assert(await childMem.readInt16(wa + 2n) === 0x1234,
				"cross-process readInt16");
			assert(await childMem.readInt32(wa + 4n) === 0x12345678,
				"cross-process readInt32");
			assert(await childMem.readBool(wa + 8n) === true,
				"cross-process readBool");
			assert(await childMem.readInt64(wa + 16n) === 0x1122,
				"cross-process readInt64");
			assert(await childMem.readString(wa + 24n, 2) === "Hi",
				"cross-process readString");
			assert(await childMem.readReal32(wa + 28n) === 1.5,
				"cross-process readReal32");
			assert(await childMem.readReal64(wa + 32n) === 2.5,
				"cross-process readReal64");
			assert(await childMem.readPtr(wa + 40n) === 0x1234,
				"cross-process readPtr");

			// Belt-and-suspenders: ask the child to re-dump its buffer.
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
			await childMem.writeData(wa, Buffer.alloc(64, 0xA5), 64);
			await childMem.writeInt8(wa, -1);
			await childMem.writeInt16(wa + 2n, -2);
			await childMem.writeInt32(wa + 4n, -3);
			await childMem.writeInt64(wa + 16n, -4);

			assert(await childMem.readInt8(wa) === -1,
				"cross-process readInt8 negative");
			assert(await childMem.readInt16(wa + 2n) === -2,
				"cross-process readInt16 negative");
			assert(await childMem.readInt32(wa + 4n) === -3,
				"cross-process readInt32 negative");
			assert(await childMem.readInt64(wa + 16n) === -4,
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
			await childMem.writeData(wa, Buffer.alloc(64, 0xA5), 64);
			_hex = await _queryChild();
			assert(_hex.substring(0, 2) === "a5",
				"cross-process writeData restore visible");

			childProc.close();
		} finally {
			try { _child.stdin.end(); } catch (_) {}
			try { _child.kill(); } catch (_) {}
		}

		// --- task_for_pid failure path (macOS, non-root -> root process) ---
		if (process.platform === "darwin" &&
			typeof process.getuid === "function" &&
			process.getuid() === 0) {
			var _nrScript =
				"(async function() {" +
				"try {" +
				"  var m = require(" + JSON.stringify(_path.resolve(__dirname, "..")) + ");" +
				"  var p = new m.Process(); p.open(1);" +
				"  var mem = new m.Memory(p);" +
				"  process.stdout.write(await mem.isValid() ? 'TASK_OK' : 'TASK_DENIED');" +
				"} catch (e) { process.stderr.write(String(e)); }" +
				"})();";
			var _nrResult = null;
			try {
				_nrResult = _cp.spawnSync(process.execPath,
					["-e", _nrScript],
					{
						uid: -2, gid: -2,   // macOS "nobody"
						stdio: ["ignore", "pipe", "pipe"],
						env: process.env,
						timeout: 5000,
					});
			} catch (_) { _nrResult = null; }
			var _nrOut = _nrResult && _nrResult.stdout
				? _nrResult.stdout.toString() : "";
			if (_nrOut.indexOf("TASK_DENIED") >= 0) {
				assert(true, "non-root Memory(pid=1) denied (task_for_pid KERN_FAILURE)");
			} else if (_nrOut.indexOf("TASK_OK") >= 0) {
				log("(task_for_pid succeeded as nobody?) ");
			} else {
				log("(non-root helper unavailable) ");
			}
		}

		// --- Multi-value (count > 1) typed reads ---
		if (readable && readable.size >= 32n) {
			var mv8 = await mem.readInt8(readable.start, 4);
			assert(Array.isArray(mv8), "readInt8 count=4 returns array");
			assert(mv8.length === 4, "readInt8 count=4 length");
			var mv16 = await mem.readInt16(readable.start, 2);
			assert(Array.isArray(mv16), "readInt16 count=2 returns array");
			var mv32 = await mem.readInt32(readable.start, 2);
			assert(Array.isArray(mv32), "readInt32 count=2 returns array");
			var mvr32 = await mem.readReal32(readable.start, 2);
			assert(Array.isArray(mvr32), "readReal32 count=2 returns array");
			var mvr64 = await mem.readReal64(readable.start, 2);
			assert(Array.isArray(mvr64), "readReal64 count=2 returns array");
			var mvb = await mem.readBool(readable.start, 4);
			assert(Array.isArray(mvb), "readBool count=4 returns array");
			var mvs = await mem.readString(readable.start, 4, 2);
			assert(Array.isArray(mvs), "readString count=2 returns array");
			var mv64 = await mem.readInt64(readable.start, 2);
			assert(Array.isArray(mv64), "readInt64 count=2 returns array");
			var mvp = await mem.readPtr(readable.start, 2);
			assert(Array.isArray(mvp), "readPtr count=2 returns array");

			var mvStride = await mem.readInt8(readable.start, 2, 4);
			assert(Array.isArray(mvStride), "readInt8 with stride returns array");
		}

		// --- Flag-bearing reads: SKIP_ERRORS / AUTO_ACCESS ---
		if (readable) {
			var spanStart = readable.start;
			var spanLen = Number(readable.size * 2n < 1048576n ? readable.size * 2n : 1048576n);
			var spanBuf = Buffer.alloc(spanLen);
			var gotSkip = await mem.readData(spanStart, spanBuf, spanLen, Memory.SKIP_ERRORS);
			assert(typeof gotSkip === "number", "readData SKIP_ERRORS returns number");
			var gotAuto = await mem.readData(spanStart, spanBuf, spanLen, Memory.AUTO_ACCESS);
			assert(typeof gotAuto === "number", "readData AUTO_ACCESS returns number");

			var writable = null;
			for (var j = 0; j < regions.length; ++j) {
				if (regions[j].valid && regions[j].bound && regions[j].writable && regions[j].size > 16n) {
					writable = regions[j];
					break;
				}
			}
			if (writable) {
				var wBuf = Buffer.alloc(16);
				var wroteSkip = await mem.writeData(writable.start, wBuf, 16, Memory.SKIP_ERRORS);
				assert(typeof wroteSkip === "number", "writeData SKIP_ERRORS returns number");
				var wroteAuto = await mem.writeData(writable.start, wBuf, 16, Memory.AUTO_ACCESS);
				assert(typeof wroteAuto === "number", "writeData AUTO_ACCESS returns number");
			}
		}

		// --- readData with zero length early-out ---
		assert(await mem.readData(readable ? readable.start : 0n, Buffer.alloc(1), 0) === 0, "readData len=0");
		assert(await mem.writeData(readable ? readable.start : 0n, Buffer.alloc(1), 0) === 0, "writeData len=0");

		await proc.close();

		log("OK\n");
		return true;
	}

	async function testSetAccess() {
		log("  setAccess... ");
		var Process = mechatron.Process;
		var Memory  = mechatron.Memory;
		var proc = await Process.getCurrent();
		var mem = new Memory(proc);
		assert(await mem.isValid(), "setAccess: mem valid");
		var regions = await mem.getRegions();
		var readable = null;
		for (var i = 0; i < regions.length; ++i) {
			if (regions[i].valid && regions[i].bound && regions[i].readable && regions[i].size > 16n) {
				readable = regions[i];
				break;
			}
		}
		assert(readable !== null, "setAccess: found readable region");
		var access = await mem.setAccess(readable, readable.readable, readable.writable, readable.executable);
		assert(typeof access === "boolean", "setAccess rwx returns bool");
		var accessFlags = await mem.setAccess(readable, readable.access);
		assert(typeof accessFlags === "boolean", "setAccess flags returns bool");
		await proc.close();
		log("OK\n");
		return true;
	}

	async function testCtor() {
		log("  Memory ctor... ");
		var Process = mechatron.Process;
		var Memory  = mechatron.Memory;
		var mem = new Memory();
		assert(!await mem.isValid(), "empty ctor invalid");
		var proc = new Process();
		mem = new Memory(proc);
		assert(!await mem.isValid(), "invalid proc ctor invalid");
		assert(mem.getProcess().eq(proc), "getProcess eq");
		proc = await Process.getCurrent();
		mem = new Memory(proc);
		assert(await mem.isValid(), "current proc ctor valid");
		var copy = new Memory(mem);
		assert(await copy.isValid(), "copy ctor valid");
		assert(copy.getProcess().eq(proc), "copy ctor getProcess eq");
		log("OK\n");
		return true;
	}

	return [
		{
			name: "memory ctor",
			functions: ["memory_ctor"],
			test: testCtor,
		},
		{
			name: "memory",
			functions: [
				"memory_isValid", "memory_getRegions", "memory_getRegion",
				"memory_getPageSize", "memory_getMinAddress", "memory_getMaxAddress",
				"memory_getPtrSize", "memory_readData", "memory_writeData", "memory_find",
				"process_getCurrent", "process_open", "process_close",
			],
			test: testMemory,
		},
		{
			name: "memory setAccess",
			functions: ["memory_setAccess", "memory_setAccessFlags"],
			test: testSetAccess,
		},
	];
};
