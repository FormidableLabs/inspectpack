"use strict";

const workerpool = require("workerpool");

const actions = require("../actions");
const Compressor = require("../utils/compressor");

const cacheDirArg = process.argv
  .find(arg => arg.indexOf("cacheDir=") !== -1);
const cacheDir = cacheDirArg && cacheDirArg
  .replace("cacheDir=", "");

// Create worker methods for each corresponding action.
// The generated methods look like `sizes(...).then(...)`
const wrapMethod = (action, compressor) => args =>
  new Promise((resolve, reject) =>
    actions(action)(
      Object.assign({}, args, { compressor }),
      (err, result) => {
        if (err) {
          return reject(err);
        }
        compressor.saveCache();
        return resolve(result);
      }
    ));

// Create each action method, injecting a compressor
// instance for each one.
Promise.all(
  Object.keys(actions.ACTIONS).map(action =>
    Compressor.init({
      scope: `${action}-compressor`,
      cacheDir
    }).then(compressor => ({
      [action]: wrapMethod(action, compressor)
    })))
)
  .then(actionMaps =>
    actionMaps.reduce((acc, map) =>
      Object.assign({}, acc, map), {})
    )
  .then(workerpool.worker);
