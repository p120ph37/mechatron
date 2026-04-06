////////////////////////////////////////////////////////////////////////////////
// -------------------------------------------------------------------------- //
//                                                                            //
//                    Mechatron Process Test Module                            //
//                                                                            //
//  Exercises Process class using the modern mechatron API.                   //
//                                                                            //
// -------------------------------------------------------------------------- //
////////////////////////////////////////////////////////////////////////////////

"use strict";

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip, machVMAvailable) {

	function testProcess() {
		log("  Process... ");

		var Process = mechatron.Process;

		// --- Invalid process ---
		var p = new Process();
		assert(!p.isValid(), "empty invalid");
		assert(p.getPID() === 0, "empty pid=0");
		assert(p.getName() === "", "empty name empty");
		assert(p.getPath() === "", "empty path empty");
		assert(p.hasExited(), "empty hasExited");

		p = new Process(8888);
		assert(!p.isValid(), "bogus pid invalid");
		assert(p.getPID() === 8888, "bogus pid stored");

		// Equality on invalid
		var p2 = new Process();
		assert(p2.eq(0), "empty eq 0");
		assert(p2.ne(8888), "empty ne 8888");

		// --- getCurrent ---
		var curr = Process.getCurrent();
		assert(curr.isValid(), "current valid");
		assert(curr.getPID() > 0, "current pid > 0");
		assert(curr.getName().length > 0, "current has name");
		assert(curr.getPath().length > 0, "current has path");
		assert(!curr.hasExited(), "current not exited");

		// Open by PID
		var p3 = new Process();
		assert(p3.open(curr.getPID()), "open current pid");
		assert(p3.isValid(), "opened valid");
		assert(p3.eq(curr), "opened eq current");

		// --- getList ---
		var list = Process.getList();
		assert(list.length > 0, "getList non-empty");
		assert(list instanceof Array, "getList is array");

		for (var i = 0; i < Math.min(list.length, 10); ++i) {
			assert(list[i].isValid(), "list[" + i + "] valid");
			assert(list[i].getPID() > 0, "list[" + i + "] pid > 0");
		}

		// Regex filter
		var filtered = Process.getList(".*node.*");
		assert(filtered.length > 0, "filtered has node");

		// --- isSys64Bit ---
		assert(typeof Process.isSys64Bit() === "boolean", "isSys64Bit bool");

		// --- getModules ---
		if (machVMAvailable) {
			var mods = curr.getModules();
			assert(mods instanceof Array, "getModules is array");
			assert(mods.length > 0, "getModules non-empty");

			// Module properties
			var mod = mods[0];
			assert(typeof mod.getName() === "string", "module getName");
			assert(typeof mod.getBase() === "number", "module getBase");
			assert(typeof mod.getSize() === "number", "module getSize");
		} else {
			expectOrSkip("machVM", "Process.getModules (mach VM)");
			log("(getModules unavailable) ");
		}

		// --- is64Bit, isDebugged ---
		assert(typeof curr.is64Bit() === "boolean", "is64Bit bool");
		assert(typeof curr.isDebugged() === "boolean", "isDebugged bool");

		// --- Async variants ---
		var pa1 = Process.getListAsync();
		assert(pa1 instanceof Promise, "getListAsync returns Promise");
		if (machVMAvailable) {
			var pa2 = curr.getModulesAsync();
			assert(pa2 instanceof Promise, "getModulesAsync returns Promise");
		}

		// --- close ---
		curr.close();

		log("OK\n");
		return true;
	}

	return {
		testProcess: testProcess,
	};
};
