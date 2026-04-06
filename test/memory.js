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

		// --- Module (data type only) ---
		var mod = new Module();
		assert(mod.valid === false, "empty module invalid");
		assert(mod.name === "", "empty module name");
		assert(mod.base === 0, "empty module base");
		assert(mod.size === 0, "empty module size");
		assert(mod.isValid() === false, "empty module isValid");
		assert(mod.getName() === "", "empty module getName");
		assert(mod.getBase() === 0, "empty module getBase");
		assert(mod.getSize() === 0, "empty module getSize");

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

		// --- Cache operations ---
		assert(typeof mem.isCaching() === "boolean", "isCaching bool");
		assert(typeof mem.getCacheSize() === "number", "getCacheSize number");

		// Modules of current process
		var mods = proc.getModules();
		assert(mods.length > 0, "current proc has modules");

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
