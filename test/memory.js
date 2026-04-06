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

		// --- Typed reads from readable region ---
		if (readable) {
			var v8 = mem.readInt8(readable.start);
			assert(typeof v8 === "number" || v8 === null, "readInt8 returns number|null");
			var v16 = mem.readInt16(readable.start);
			assert(typeof v16 === "number" || v16 === null, "readInt16 returns number|null");
			var v32 = mem.readInt32(readable.start);
			assert(typeof v32 === "number" || v32 === null, "readInt32 returns number|null");
			var vr32 = mem.readReal32(readable.start);
			assert(typeof vr32 === "number" || vr32 === null, "readReal32 returns number|null");
			var vr64 = mem.readReal64(readable.start);
			assert(typeof vr64 === "number" || vr64 === null, "readReal64 returns number|null");
			var vb = mem.readBool(readable.start);
			assert(typeof vb === "boolean" || vb === null, "readBool returns bool|null");
			var vp = mem.readPtr(readable.start);
			assert(typeof vp === "number" || vp === null, "readPtr returns number|null");
		}

		// --- Cache operations ---
		assert(typeof mem.isCaching() === "boolean", "isCaching bool");
		assert(typeof mem.getCacheSize() === "number", "getCacheSize number");
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

		// --- Memory clone ---
		var memCl = mem.clone();
		assert(memCl.isValid(), "clone valid");
		assert(memCl.getProcess().eq(proc), "clone getProcess eq");

		// --- Write operations on readable/writable region ---
		var writable = null;
		for (var wi = 0; wi < regions.length; ++wi) {
			if (regions[wi].valid && regions[wi].bound && regions[wi].readable && regions[wi].writable && regions[wi].size > 64) {
				writable = regions[wi];
				break;
			}
		}

		if (writable) {
			// Read original values, write, then restore
			var origBuf = Buffer.alloc(8);
			mem.readData(writable.start, origBuf, 8);

			// writeInt8
			assert(typeof mem.writeInt8(writable.start, 42) === "boolean", "writeInt8 returns bool");
			// writeInt16
			assert(typeof mem.writeInt16(writable.start, 1234) === "boolean", "writeInt16 returns bool");
			// writeInt32
			assert(typeof mem.writeInt32(writable.start, 12345678) === "boolean", "writeInt32 returns bool");
			// writeReal32
			assert(typeof mem.writeReal32(writable.start, 3.14) === "boolean", "writeReal32 returns bool");
			// writeReal64
			assert(typeof mem.writeReal64(writable.start, 3.14159265) === "boolean", "writeReal64 returns bool");
			// writeBool
			assert(typeof mem.writeBool(writable.start, true) === "boolean", "writeBool returns bool");
			// writeInt64
			assert(typeof mem.writeInt64(writable.start, 9999) === "boolean", "writeInt64 returns bool");
			// writeString
			assert(typeof mem.writeString(writable.start, "hi") === "boolean", "writeString returns bool");
			// writePtr
			assert(typeof mem.writePtr(writable.start, 0) === "boolean", "writePtr returns bool");

			// Restore original data
			mem.writeData(writable.start, origBuf, 8);
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

		// --- setAccess (exercise, may not succeed on all regions) ---
		if (readable) {
			var access = mem.setAccess(readable, readable.readable, readable.writable, readable.executable);
			assert(typeof access === "boolean", "setAccess returns bool");
		}

		// --- readString single ---
		if (readable) {
			var rs = mem.readString(readable.start, 4);
			assert(typeof rs === "string" || rs === null, "readString returns string|null");
		}

		// --- readInt64 single ---
		if (readable && readable.size >= 8) {
			var r64 = mem.readInt64(readable.start);
			assert(typeof r64 === "number" || r64 === null, "readInt64 returns number|null");
		}

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
