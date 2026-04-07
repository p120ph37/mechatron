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

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip, machVMAvailable) {

	function testMemory() {
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

		if (!machVMAvailable) {
			expectOrSkip("machVM", "Memory (mach VM)");
			log("(macOS mach VM unavailable) OK\n");
			return true;
		}

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
		// Spawn a child node HTTP server that holds a known buffer, write to
		// the child's memory via the Memory API, then HTTP GET the child to
		// prove the target process sees the change.
		var _cp = require("child_process");
		var _fs = require("fs");
		var _portFile = require("os").tmpdir() + require("path").sep
			+ "mechatron-memtest-" + process.pid;
		try { _fs.unlinkSync(_portFile); } catch (_) {}

		// Child source: 64-byte buffer filled with 0xA5, served as hex via HTTP
		var _childSrc =
			'var h=require("http"),f=require("fs"),' +
			'b=Buffer.alloc(64,0xA5),' +
			's=h.createServer(function(q,r){r.end(b.toString("hex"))});' +
			's.listen(0,function(){' +
			'f.writeFileSync(' + JSON.stringify(_portFile) + ',""+s.address().port)})';

		var _child = _cp.spawn(process.execPath, ["-e", _childSrc], {
			stdio: "ignore"
		});
		var _port = null;
		for (var _pi = 0; _pi < 50 && !_port; _pi++) {
			mechatron.Timer.sleep(100);
			try { _port = +_fs.readFileSync(_portFile, "utf8"); } catch (_) {}
		}

		if (_port) {
			var childProc = new Process();
			childProc.open(_child.pid);
			var childMem = new Memory(childProc);

			// Locate the 0xA5-filled buffer in the child's address space.
			// Search for 48 consecutive bytes to reduce false positives,
			// then pick the first hit in a writable region (read-only
			// matches can appear in e.g. data sections on macOS).
			var _hp = [];
			for (var _hi = 0; _hi < 48; _hi++) _hp.push("a5");
			var _addrs = childMem.find(_hp.join(" "), undefined, undefined, 10);
			var wa = null;
			for (var _ai = 0; _ai < _addrs.length; _ai++) {
				var _reg = childMem.getRegion(_addrs[_ai]);
				if (_reg.writable) { wa = _addrs[_ai]; break; }
			}

			if (wa !== null) {

				// Helper: query child's HTTP server for the buffer hex dump
				function _queryChild() {
					return _cp.execFileSync(process.execPath, ["-e",
						'var h=require("http");' +
						'h.get("http://127.0.0.1:' + _port + '/",function(r){' +
						'var d="";r.on("data",function(c){d+=c});' +
						'r.on("end",function(){process.stdout.write(d)})})'],
						{ encoding: "utf8", timeout: 5000 });
				}

				// Write various types at non-overlapping offsets, then verify
				// via a single HTTP query that the child process sees them all.
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

				// Read back via typed read methods
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

				// Verify via child's own view (HTTP hex dump)
				var _hex = _queryChild();
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

				// Verify the same via child's own view (HTTP hex dump)
				_hex = _queryChild();
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
				_hex = _queryChild();
				assert(_hex.substring(0, 2) === "a5",
					"cross-process writeData restore visible");
			} else {
				log("(child scratch not found or not writable) ");
			}

			_child.kill();
			childProc.close();
		} else {
			log("(child server failed to start) ");
		}
		try { _fs.unlinkSync(_portFile); } catch (_) {}

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
