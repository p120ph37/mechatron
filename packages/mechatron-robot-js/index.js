"use strict";

// mechatron-robot-js — drop-in robot-js replacement backed by mechatron.
//
// Usage:
//   // Before (robot-js):
//   var robot = require("robot-js");
//
//   // After (mechatron-robot-js):
//   var robot = require("mechatron-robot-js");
//
// The entire public API surface is identical to robot-js 2.2.0.

module.exports = require("mechatron");
