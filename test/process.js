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

module.exports = function (mechatron, log, assert, waitFor) {

	var Process = mechatron.Process;
	var Module = mechatron.Module;

	return [

		// ----- Invalid process defaults -----
		{
			name: "Process empty/invalid defaults",
			functions: ["process_isValid"],
			test: async function () {
				var p = new Process();
				assert(!await p.isValid(), "empty invalid");
				assert(p.getPID() === 0, "empty pid=0");
				assert(await p.getName() === "", "empty name empty");
				assert(await p.getPath() === "", "empty path empty");

				p = new Process(2147483646);
				assert(!await p.isValid(), "bogus pid invalid");
				assert(p.getPID() === 2147483646, "bogus pid stored");

				// Equality on invalid
				var p2 = new Process();
				assert(p2.eq(0), "empty eq 0");
				assert(p2.ne(2147483646), "empty ne 2147483646");
			}
		},

		// ----- hasExited on invalid process -----
		{
			name: "Process hasExited (invalid)",
			functions: ["process_hasExited"],
			test: async function () {
				var p = new Process();
				assert(await p.hasExited(), "empty hasExited");
			}
		},

		// ----- getCurrent -----
		{
			name: "Process getCurrent",
			functions: ["process_getCurrent"],
			test: async function () {
				var curr = await Process.getCurrent();
				assert(await curr.isValid(), "current valid");
				assert(curr.getPID() > 0, "current pid > 0");
				assert((await curr.getName()).length > 0, "current has name");
				assert((await curr.getPath()).length > 0, "current has path");
				assert(!await curr.hasExited(), "current not exited");
			}
		},

		// ----- is64Bit -----
		{
			name: "Process is64Bit",
			functions: ["process_getCurrent", "process_is64Bit"],
			test: async function () {
				var curr = await Process.getCurrent();
				assert(typeof await curr.is64Bit() === "boolean", "is64Bit bool");
			}
		},

		// ----- isDebugged -----
		{
			name: "Process isDebugged",
			functions: ["process_getCurrent", "process_isDebugged"],
			test: async function () {
				var curr = await Process.getCurrent();
				assert(typeof await curr.isDebugged() === "boolean", "isDebugged bool");
			}
		},

		// ----- getName / getPath -----
		{
			name: "Process getName / getPath",
			functions: ["process_getCurrent", "process_getName", "process_getPath"],
			test: async function () {
				var curr = await Process.getCurrent();
				assert((await curr.getName()).length > 0, "current has name");
				assert((await curr.getPath()).length > 0, "current has path");
			}
		},

		// ----- getHandle -----
		{
			name: "Process getHandle",
			functions: ["process_getCurrent", "process_getHandle"],
			test: async function () {
				var curr = await Process.getCurrent();
				assert(typeof await curr.getHandle() === "number", "getHandle number");
			}
		},

		// ----- open / close -----
		{
			name: "Process open / close",
			functions: ["process_open", "process_close"],
			test: async function () {
				var curr = await Process.getCurrent();

				var p3 = new Process();
				assert(await p3.open(curr.getPID()), "open current pid");
				assert(await p3.isValid(), "opened valid");
				assert(p3.eq(curr), "opened eq current");

				var p4 = new Process();
				assert(await p4.open(curr.getPID()), "open by pid");
				assert(await p4.isValid(), "opened valid");
				await p4.close();

				await curr.close();
			}
		},

		// ----- getList -----
		{
			name: "Process getList",
			functions: ["process_getList"],
			test: async function () {
				var list = await Process.getList();
				assert(list.length > 0, "getList non-empty");
				assert(list instanceof Array, "getList is array");

				var anyValid = false;
				for (var i = 0; i < Math.min(list.length, 10); ++i) {
					assert(list[i].getPID() > 0, "list[" + i + "] pid > 0");
					if (await list[i].isValid()) anyValid = true;
				}
				assert(anyValid, "at least one listed process still valid");

				// Regex filter — pattern derived from the current process so the
				// test works under any runtime (node, bun, ...).
				var curr = await Process.getCurrent();
				var ownName = (await curr.getName()).replace(/[\\.+*?^$()[\]{}|]/g, "\\$&");
				var filtered = await Process.getList(".*" + ownName + ".*");
				assert(filtered.length > 0, "filtered has " + ownName);
			}
		},

		// ----- isSys64Bit -----
		{
			name: "Process isSys64Bit",
			functions: ["process_isSys64Bit"],
			test: async function () {
				assert(typeof await Process.isSys64Bit() === "boolean", "isSys64Bit bool");
			}
		},

		// ----- getModules (includes Module class tests and getSegments) -----
		{
			name: "Process getModules / Module class / getSegments",
			functions: ["process_getModules", "process_getSegments"],
			test: async function () {
				var curr = await Process.getCurrent();
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
		},

		// ----- exit on invalid process (no-crash) -----
		{
			name: "Process exit (invalid, no-crash)",
			functions: ["process_exit"],
			test: async function () {
				var pBogus = new Process();
				await pBogus.exit();
			}
		},

		// ----- kill on invalid process (no-crash) -----
		{
			name: "Process kill (invalid, no-crash)",
			functions: ["process_kill"],
			test: async function () {
				var pBogus = new Process();
				await pBogus.kill();
			}
		},

		// ----- Process copy constructor / clone -----
		{
			name: "Process copy constructor / clone",
			functions: ["process_ctor"],
			test: async function () {
				var curr = await Process.getCurrent();

				var pCopy = new Process(curr);
				assert(pCopy.eq(curr), "copy ctor eq");
				assert(pCopy.getPID() === curr.getPID(), "copy ctor pid");

				var pClone = curr.clone();
				assert(pClone.eq(curr), "clone eq");
				assert(pClone.getPID() === curr.getPID(), "clone pid");
			}
		},

	];
};
