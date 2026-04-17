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

module.exports = function (mechatron, log, assert, waitFor, expectOrSkip) {

	async function testProcess() {
		log("  Process... ");

		var Process = mechatron.Process;

		// --- Invalid process ---
		var p = new Process();
		assert(!await p.isValid(), "empty invalid");
		assert(p.getPID() === 0, "empty pid=0");
		assert(await p.getName() === "", "empty name empty");
		assert(await p.getPath() === "", "empty path empty");
		assert(await p.hasExited(), "empty hasExited");

		p = new Process(8888);
		assert(!await p.isValid(), "bogus pid invalid");
		assert(p.getPID() === 8888, "bogus pid stored");

		// Equality on invalid
		var p2 = new Process();
		assert(p2.eq(0), "empty eq 0");
		assert(p2.ne(8888), "empty ne 8888");

		// --- getCurrent ---
		var curr = await Process.getCurrent();
		assert(await curr.isValid(), "current valid");
		assert(curr.getPID() > 0, "current pid > 0");
		assert((await curr.getName()).length > 0, "current has name");
		assert((await curr.getPath()).length > 0, "current has path");
		assert(!await curr.hasExited(), "current not exited");

		// Open by PID
		var p3 = new Process();
		assert(await p3.open(curr.getPID()), "open current pid");
		assert(await p3.isValid(), "opened valid");
		assert(p3.eq(curr), "opened eq current");

		// --- getList ---
		var list = await Process.getList();
		assert(list.length > 0, "getList non-empty");
		assert(list instanceof Array, "getList is array");

		var anyValid = false;
		for (var i = 0; i < Math.min(list.length, 10); ++i) {
			assert(list[i].getPID() > 0, "list[" + i + "] pid > 0");
			if (await list[i].isValid()) anyValid = true;
		}
		assert(anyValid, "at least one listed process still valid");

		// Regex filter — pattern derived from the current process so the test
		// works under any runtime (node, bun, …).
		var ownName = (await curr.getName()).replace(/[\\.+*?^$()[\]{}|]/g, "\\$&");
		var filtered = await Process.getList(".*" + ownName + ".*");
		assert(filtered.length > 0, "filtered has " + ownName);

		// --- isSys64Bit ---
		assert(typeof await Process.isSys64Bit() === "boolean", "isSys64Bit bool");

		// --- open / close ---
		var p4 = new Process();
		assert(await p4.open(curr.getPID()), "open by pid");
		assert(await p4.isValid(), "opened valid");
		await p4.close();

		// --- getHandle ---
		assert(typeof await curr.getHandle() === "number", "getHandle number");

		// --- getWindows ---
		var wins = await curr.getWindows();
		assert(wins instanceof Array, "getWindows is array");

		// --- getModules ---
		{
			var mods = await curr.getModules();
			assert(mods instanceof Array, "getModules is array");
			assert(mods.length > 0, "getModules non-empty");

			// Module properties
			var mod = mods[0];
			assert(typeof mod.getName() === "string", "module getName");
			assert(typeof mod.getPath() === "string", "module getPath");
			assert(typeof mod.getBase() === "number", "module getBase");
			assert(typeof mod.getSize() === "number", "module getSize");
			assert(mod.isValid(), "module isValid");
			assert(mod.getProcess() instanceof Process, "module getProcess");

			// Module contains
			if (mod.getSize() > 0) {
				assert(mod.contains(mod.getBase()), "module contains base");
				assert(!mod.contains(0), "module !contains 0");
			}

			// Module comparison
			if (mods.length > 1) {
				var m0 = mods[0], m1 = mods[1];
				var cmp = (m0.getBase() < m1.getBase());
				assert(m0.lt(m1) === cmp, "module lt");
				assert(m0.gt(m1) === !cmp && m0.getBase() !== m1.getBase(), "module gt");
				assert(typeof m0.le(m1) === "boolean", "module le");
				assert(typeof m0.ge(m1) === "boolean", "module ge");
				assert(typeof m0.eq(m1) === "boolean", "module eq");
				assert(typeof m0.ne(m1) === "boolean", "module ne");
			}

			// Module 5-param constructor
			var Module = mechatron.Module;
			var mod5 = new Module(curr, "testmod", "/test/path", 0x1000, 0x2000);
			assert(mod5.isValid(), "Module 5-param valid");
			assert(mod5.getName() === "testmod", "Module 5-param name");
			assert(mod5.getPath() === "/test/path", "Module 5-param path");
			assert(mod5.getBase() === 0x1000, "Module 5-param base");
			assert(mod5.getSize() === 0x2000, "Module 5-param size");
			assert(mod5.getProcess().eq(curr), "Module 5-param process");

			// Module clone
			var mc = mod.clone();
			assert(mc.getName() === mod.getName(), "module clone name");
			assert(mc.getBase() === mod.getBase(), "module clone base");

			// Module getSegments
			var segs = mod.getSegments();
			assert(segs instanceof Array, "module getSegments is array");

			// Module clone with segments populated
			var mc2 = mod.clone();
			assert(mc2.getSegments() instanceof Array, "cloned module getSegments");

			// Module TypeError for comparison with invalid type
			var modThrew = false;
			try { mod.lt("bad"); } catch(e) { modThrew = true; }
			assert(modThrew, "module lt invalid throws");
			modThrew = false;
			try { mod.gt("bad"); } catch(e) { modThrew = true; }
			assert(modThrew, "module gt invalid throws");
			modThrew = false;
			try { mod.le("bad"); } catch(e) { modThrew = true; }
			assert(modThrew, "module le invalid throws");
			modThrew = false;
			try { mod.ge("bad"); } catch(e) { modThrew = true; }
			assert(modThrew, "module ge invalid throws");
			modThrew = false;
			try { mod.eq("bad"); } catch(e) { modThrew = true; }
			assert(modThrew, "module eq invalid throws");
			modThrew = false;
			try { mod.ne("bad"); } catch(e) { modThrew = true; }
			assert(modThrew, "module ne invalid throws");

			// Segment ne
			if (segs.length > 0) {
				var segNe = segs[0].ne(new mechatron.Segment());
				assert(typeof segNe === "boolean", "segment ne returns bool");
			}
		}

		// --- Process copy constructor ---
		var pCopy = new Process(curr);
		assert(pCopy.eq(curr), "copy ctor eq");
		assert(pCopy.getPID() === curr.getPID(), "copy ctor pid");

		// --- Process clone ---
		var pClone = curr.clone();
		assert(pClone.eq(curr), "clone eq");
		assert(pClone.getPID() === curr.getPID(), "clone pid");

		// --- is64Bit, isDebugged ---
		assert(typeof await curr.is64Bit() === "boolean", "is64Bit bool");
		assert(typeof await curr.isDebugged() === "boolean", "isDebugged bool");

		var pBogus = new Process();
		await pBogus.exit();
		await pBogus.kill();

		await curr.close();

		log("OK\n");
		return true;
	}

	return {
		testProcess: testProcess,
	};
};
