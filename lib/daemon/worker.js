"use strict";

const workerpool = require("workerpool");

const actions = require("../actions");
const Compressor = require("../utils/compressor");
const SafeJSON = require("../utils/safe-json");
const Cache = require("../utils/cache");

// Deserialize options and inflate needed objects.
const INFLATE_ARGS_IDX = 2;
const inflated = SafeJSON.parse(process.argv[INFLATE_ARGS_IDX]) || {};
const cacheOpts = inflated.cache || {};
const cacheCls = cacheOpts.cls || Cache.NoopCache.name;
delete cacheOpts.cls;
const cache = Cache[cacheCls].create(cacheOpts);

// Create worker methods for each corresponding action.
// The generated methods look like `sizes(...).then(...)`
const wrapMethod = (action, compressor) => (args) =>
  new Promise((resolve, reject) =>
    actions(action)(
      Object.assign({}, args, { compressor }),
      (err, result) => err ? reject(err) : resolve(result)
    ));

// Create each action method, injecting a compressor
// instance for each one.
workerpool.worker(
  Object.keys(actions.ACTIONS).reduce(
    (acc, action) => Object.assign({}, acc, {
      [action]: wrapMethod(
        action,
        Compressor.create({ cache })
      )
    }),
    {}
  )
);
