/**
 * Worker-thread in-process polyfill — main-thread side.
 *
 * Exports `InProcessWorker`, a drop-in replacement for `worker_threads.Worker`
 * that loads the impl module directly in the main thread and dispatches calls
 * synchronously.  Since the impl code runs in the same bun process,
 * `bun --coverage` instruments it and the lines appear in lcov output.
 *
 * Worker entry files follow the pattern:
 *   import * as impl from "./<sub>-impl";
 *   runWorker(impl);
 * This polyfill derives the impl module path from the worker path and
 * loads it directly, skipping runWorker/parentPort entirely.
 *
 * Usage in tests:
 *   var { InProcessWorker } = require("./worker-subprocess-polyfill");
 *   require("../lib/ffi/_dispatch")._setWorkerCtor(InProcessWorker);
 */
"use strict";

function InProcessWorker(workerPath) {
  var self = this;
  self._handlers = { message: [], error: [] };
  self._impl = null;

  var implPath = workerPath.replace(/-worker\.ts$/, "-impl.ts");
  try {
    self._impl = require(implPath);
  } catch (e) {
    setTimeout(function () {
      var handlers = self._handlers.error;
      for (var i = 0; i < handlers.length; i++) handlers[i](e);
    }, 0);
  }
}

InProcessWorker.prototype.on = function (event, handler) {
  if (this._handlers[event]) this._handlers[event].push(handler);
  return this;
};

InProcessWorker.prototype.postMessage = function (data) {
  var self = this;
  if (!self._impl) return;

  var fn = self._impl[data.op];
  if (typeof fn !== "function") {
    setTimeout(function () {
      var handlers = self._handlers.message;
      for (var i = 0; i < handlers.length; i++) {
        handlers[i]({ id: data.id, error: "unknown op: " + data.op });
      }
    }, 0);
    return;
  }

  Promise.resolve()
    .then(function () { return fn.apply(null, data.args || []); })
    .then(function (result) {
      var handlers = self._handlers.message;
      for (var i = 0; i < handlers.length; i++) {
        handlers[i]({ id: data.id, result: result });
      }
    })
    .catch(function (err) {
      var handlers = self._handlers.message;
      for (var i = 0; i < handlers.length; i++) {
        handlers[i]({ id: data.id, error: err && err.message || String(err) });
      }
    });
};

InProcessWorker.prototype.ref = function () {};
InProcessWorker.prototype.unref = function () {};

InProcessWorker.prototype.terminate = function () {
  this._impl = null;
  return Promise.resolve(0);
};

exports.InProcessWorker = InProcessWorker;
