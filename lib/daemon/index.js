"use strict";

const cpus = require("os").cpus;
const path = require("path");
const workerpool = require("workerpool");

const actions = require("../actions");

class InspectpackDaemon {
  /**
   * Start the daemon with an asynchronously initialized cache.
   *
   * @param {Object} opts                  Object options
   * @param {Object} opts.cache            A cache instance
   * @returns {InspectpackDaemon} The daemon with cache
   */
  static create(opts) {
    return new InspectpackDaemon(opts);
  }

  /**
   * Start the daemon with either no cache or an existing cache.
   *
   * @param {Object} opts                  Object options
   * @param {Object} opts.cache            A cache instance
   * @returns {InspectpackDaemon} The daemon with cache
   */
  constructor(opts) {
    this._cache = (opts || {}).cache;
    if (!this._cache) {
      throw new Error("Cache is required");
    }

    this._pool = workerpool.pool(path.resolve(__dirname, "worker.js"), {
      minWorkers: cpus().length,
      maxWorkers: cpus().length,
      forkArgs: this._cache ? [JSON.stringify({ cache: this._cache.serialize() })] : []
    });
  }

  /**
   * Terminate the daemon.
   *
   * @returns {void}
   */
  terminate() {
    this._pool.clear();
  }
}

// Attach a method per corresponding action to the prototype.
// The generated methods look like `daemon.sizes(...).then(...)`
Object.keys(actions.ACTIONS).forEach((action) => {
  InspectpackDaemon.prototype[action] = function (opts) {
    return this._cache.wrapAction({
      hashArgs: (args) => ({ action, args }),
      action: (args) => this._pool.exec(action, [args])
    })(opts);
  };
});

module.exports = InspectpackDaemon;
