"use strict";

const tap = require("lodash/fp").tap;
const cpus = require("os").cpus;
const path = require("path");
const workerpool = require("workerpool");

const actions = require("../actions");
const Cache = require("../utils/cache");
const hash = require("../utils/hash");

class InspectpackDaemon {
  /**
   * Start the daemon with an asynchronously initialized cache.
   *
   * @param {Object} opts                  Object options
   * @param {Object} opts.cache            A cache instance
   * @param {Object} opts.cacheFilename    The filename of the daemon cache
   * @returns {InspectpackDaemon} The daemon with cache
   */
  static create(opts) {
    opts = opts || {};
    const cache = opts.cache || Cache.create({ filename: opts.cacheFilename });
    return new InspectpackDaemon(cache, opts);
  }

  /**
   * Start the daemon with either no cache or an existing cache.
   *
   * @param {Cache} cache                  A cache instance
   */
  constructor(cache) {
    this._cache = cache || null;
    const cacheFilename = this._cache && this._cache.filename;
    this._pool = workerpool.pool(path.resolve(__dirname, "worker.js"), {
      minWorkers: cpus().length,
      maxWorkers: cpus().length,
      forkArgs: cacheFilename ? [`cacheFilename=${cacheFilename}`] : []
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
    const hashedKey = hash({ action, opts });
    const cachedValue = this._cache.get(hashedKey);
    if (cachedValue) {
      return Promise.resolve(cachedValue);
    }

    return this._pool.exec(action, [opts])
      .then(tap((result) =>
        this._cache.set(hashedKey, result)
      ));
  };
});

module.exports = InspectpackDaemon;
