#!/usr/bin/env node
"use strict";
/*
 * Mach VM diagnostic script.
 *
 * Exercises the C-based mach_diag module and compares with the Rust native
 * module's behavior.  Dumps codesign info, task_for_pid results, region
 * enumeration, and memory read results.
 *
 * Usage:  node test/mach-diag/run.js
 *   (run with sudo on macOS for full task_for_pid access)
 */

var path = require("path");
var child_process = require("child_process");
var fs = require("fs");

// --- Build the C diagnostic module if needed ---
var buildDir = path.resolve(__dirname, "build", "Release");
var diagNode = path.join(buildDir, "mach_diag.node");

if (!fs.existsSync(diagNode)) {
  console.log("Building C diagnostic module...");
  try {
    child_process.execSync("npx node-gyp rebuild", {
      cwd: __dirname,
      stdio: "inherit",
    });
  } catch (e) {
    console.error("Failed to build diagnostic module:", e.message);
    process.exit(1);
  }
}

var diag;
try {
  diag = require(diagNode);
} catch (e) {
  console.error("Failed to load diagnostic module:", e.message);
  process.exit(1);
}

console.log("\n========================================");
console.log(" MACH VM DIAGNOSTIC REPORT");
console.log("========================================\n");

console.log("Platform:", process.platform, process.arch);
console.log("Node:", process.version);
console.log("PID:", process.pid);
console.log("UID:", process.getuid(), "EUID:", process.geteuid());
console.log("");

// --- Part 1: C module diagnostics ---
console.log("--- C module: diagnose(self) ---");
var cResult = diag.diagnose(process.pid);
console.log(JSON.stringify(cResult, null, 2));
console.log("");

// --- Part 2: Check codesign on various binaries ---
console.log("--- Binary codesign checks ---");

function checkCodesign(label, filepath) {
  console.log("\n" + label + ": " + filepath);
  if (!fs.existsSync(filepath)) {
    console.log("  (file does not exist)");
    return;
  }

  // codesign -dvvv
  try {
    var out = child_process.execSync(
      'codesign -dvvv "' + filepath + '" 2>&1',
      { encoding: "utf8", timeout: 5000 }
    );
    console.log("  codesign output:");
    out.split("\n").forEach(function (line) {
      if (line.trim()) console.log("    " + line);
    });
  } catch (e) {
    console.log("  codesign error:", e.stderr || e.message);
  }

  // dlopen test via C module
  if (diag.diagnoseBinary) {
    var binResult = diag.diagnoseBinary(filepath);
    console.log("  dlopen:", binResult.dlopen_ok ? "OK" : "FAILED");
    if (binResult.dlopen_error) {
      console.log("  dlopen error:", binResult.dlopen_error);
    }
  }
}

// Check the node binary itself
checkCodesign("Node binary", process.execPath);

// Check the C diagnostic module
checkCodesign("C diag module", diagNode);

// Check the Rust .node file
var rustNodeMap = {
  "darwin-x64": "mechatron-native.darwin-x64.node",
  "darwin-arm64": "mechatron-native.darwin-arm64.node",
};
var rustNodeFile = rustNodeMap[process.platform + "-" + process.arch];
if (rustNodeFile) {
  var rustNodePath = path.resolve(__dirname, "..", "..", "native-rs", rustNodeFile);
  checkCodesign("Rust .node", rustNodePath);
}

console.log("");

// --- Part 3: Load the Rust module and try its mach VM functions ---
console.log("--- Rust module: mach VM functions ---");
try {
  var rustPath = path.resolve(__dirname, "..", "..", "native-rs", rustNodeFile);
  var rust = require(rustPath);
  console.log("Rust module loaded OK from:", rustPath);

  // process_getCurrent
  var myPid = rust.process_getCurrent();
  console.log("process_getCurrent():", myPid);

  // process_isValid
  console.log("process_isValid(" + myPid + "):", rust.process_isValid(myPid));

  // process_open
  console.log("process_open(" + myPid + "):", rust.process_open(myPid));

  // process_getHandle (on macOS this calls task_for_pid)
  var handle = rust.process_getHandle(myPid);
  console.log("process_getHandle(" + myPid + "):", handle);

  // memory_isValid
  console.log("memory_isValid(" + myPid + "):", rust.memory_isValid(myPid));

  // memory_getRegions
  try {
    var regions = rust.memory_getRegions(myPid);
    console.log("memory_getRegions(" + myPid + "): " + (regions ? regions.length : "null") + " regions");
    if (regions && regions.length > 0) {
      for (var i = 0; i < Math.min(3, regions.length); i++) {
        var r = regions[i];
        console.log("  [" + i + "]", JSON.stringify(r));
      }
    }
  } catch (e) {
    console.log("memory_getRegions error:", e.message);
  }

  // memory_getRegion at address 0x1000
  try {
    var region = rust.memory_getRegion(myPid, 0x1000);
    console.log("memory_getRegion(" + myPid + ", 0x1000):", JSON.stringify(region));
  } catch (e) {
    console.log("memory_getRegion error:", e.message);
  }

  // Try reading memory
  try {
    var regions2 = rust.memory_getRegions(myPid);
    if (regions2 && regions2.length > 0) {
      for (var j = 0; j < regions2.length; j++) {
        if (regions2[j].valid && regions2[j].readable && regions2[j].size > 16) {
          var data = rust.memory_readData(myPid, regions2[j].start, 16);
          console.log("memory_readData: read " + (data ? data.length : 0) + " bytes from 0x" + regions2[j].start.toString(16));
          break;
        }
      }
    } else {
      console.log("memory_readData: no readable regions found (getRegions returned empty)");
    }
  } catch (e) {
    console.log("memory_readData error:", e.message);
  }

  // process_getModules
  try {
    var mods = rust.process_getModules(myPid);
    console.log("process_getModules: " + (mods ? mods.length : "null") + " modules");
    if (mods && mods.length > 0) {
      console.log("  [0]", JSON.stringify(mods[0]));
    }
  } catch (e) {
    console.log("process_getModules error:", e.message);
  }
} catch (e) {
  console.log("Rust module load FAILED:", e.message);
}

console.log("");

// --- Part 4: Compare C vs Rust mach_task_self / task_for_pid ---
console.log("--- Comparison summary ---");
console.log("C  task_for_pid result:", cResult.taskForPid.kern_return_name,
  "(kr=" + cResult.taskForPid.kern_return + ", task=" + cResult.taskForPid.task + ")");
console.log("C  mach_task_self():", cResult.machTaskSelf);
console.log("C  mach_task_self_ var:", cResult.machTaskSelf_var);
console.log("C  selfTask region:", cResult.selfTask.region_kr === 0 ? "OK" : "FAILED (kr=" + cResult.selfTask.region_kr + ")");
console.log("C  dyld info:", cResult.dyldInfo.kern_return === 0 ? "OK" : "FAILED");
if (cResult.dyldInfo.kern_return === 0) {
  console.log("C  dyld addr:", cResult.dyldInfo.allImageInfoAddr, "size:", cResult.dyldInfo.allImageInfoSize);
}
console.log("C  regions found:", cResult.regions.length);

console.log("\n========================================\n");
