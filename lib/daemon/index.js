"use strict";

const { tap } = require("lodash/fp");
const { cpus } = require("os");
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
   * @param {Object} opts.cacheFilename    The filename of the daemon cache
   * @returns {InspectpackDaemon} The daemon with cache
   */
  static init(opts = {}) {
    const cache = Cache.create({ filename: opts.cacheFilename });
    return new InspectpackDaemon(cache, opts);
  }

  /**
   * Start the daemon with either no cache or an existing cache.
   *
   * @param {Cache} cache                  An existing cache instance
   * @param {Object} opts                  Object options
   * @param {Object} opts.cacheFilename    The filename of the daemon cache
   */
  constructor(cache, opts) {
    this._cache = cache || null;
    this._cacheFilename = opts.cacheFilename || null;
    this._pool = workerpool.pool(path.resolve(__dirname, "worker.js"), {
      minWorkers: cpus().length,
      maxWorkers: cpus().length,
      forkArgs: [`cacheFilename=${this._cacheFilename}`]
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
Object.keys(actions.ACTIONS).forEach(action => {
  InspectpackDaemon.prototype[action] = function (opts) {
    if (!this._cache) {
      return this._pool.exec(action, [opts]);
    }

    const hashedKey = hash({ action, opts });
    const cachedValue = this._cache.get(hashedKey);
    if (cachedValue) {
      return Promise.resolve(cachedValue);
    }

    return this._pool.exec(action, [opts])
      .then(tap(result =>
        this._cache.set(hashedKey, result)
      ));
  };
});

module.exports = InspectpackDaemon;
