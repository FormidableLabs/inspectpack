"use strict";

const path = require("path");
const workerpool = require("workerpool");

const actions = require("../actions");
const Cache = require("../utils/cache");
const hash = require("../utils/hash");

class InspectpackDaemon {
  static init(opts) {
    opts = opts || {};

    return Cache.init({
      scope: "action-results",
      cacheDir: opts.cacheDir
    }).then(
      cache => new InspectpackDaemon(cache, opts)
    );
  }

  constructor(cache, opts) {
    this._cache = cache || null;
    this._cacheDir = opts.cacheDir || null;
    this._pool = workerpool.pool(path.resolve(__dirname, "worker.js"), {
      minWorkers: "max",
      maxWorkers: 1
    });
  }

  terminate() {
    this._pool.clear();
  }
}

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
