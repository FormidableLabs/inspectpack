"use strict";

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
   * @param {Object} opts.cacheDir         The directory to store cache files in
   * @returns {Promise<InspectpackDaemon>} The daemon with cache
   */
  static init(opts) {
    opts = opts || {};

    return Cache.init({
      scope: "action-results",
      cacheDir: opts.cacheDir
    }).then(
      cache => new InspectpackDaemon(cache, opts)
    );
  }

  /**
   * Start the daemon with either no cache or an existing cache.
   *
   * @param {Cache} cache                  An existing cache instance
   * @param {Object} opts                  Object options
   * @param {Object} opts.cacheDir         The directory to store cache files in
   */
  constructor(cache, opts) {
    this._cache = cache || null;
    this._cacheDir = opts.cacheDir || null;
    this._pool = workerpool.pool(path.resolve(__dirname, "worker.js"), {
      minWorkers: 1,
      maxWorkers: 1,
      forkArgs: [`cacheDir=${this._cacheDir}`]
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
    const hashedKey = hash({ action, opts });

    if (this._cache) {
      const cachedValue = this._cache.get(hashedKey);
      if (cachedValue) {
        return Promise.resolve(cachedValue);
      }
    }

    return this._pool.exec(action, [opts]).then(result => {
      if (this._cache) {
        this._cache.set(hashedKey, result);
        this._cache.save();
      }
      return result;
    });
  };
});

module.exports = InspectpackDaemon;
