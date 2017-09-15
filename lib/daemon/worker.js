"use strict";

const workerpool = require("workerpool");

const actions = require("../actions");
const Compressor = require("../utils/compressor");

const cacheFilenameArg = process.argv
  .find((arg) => arg.indexOf("cacheFilename=") !== -1);
const filename = cacheFilenameArg && cacheFilenameArg
  .replace("cacheFilename=", "");

// Create worker methods for each corresponding action.
// The generated methods look like `sizes(...).then(...)`
const wrapMethod = (action, compressor) => (args) =>
  new Promise((resolve, reject) =>
    actions(action)(
      Object.assign({}, args, { compressor }),
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    ));

// Create each action method, injecting a compressor
// instance for each one.
workerpool.worker(
  Object.keys(actions.ACTIONS).reduce(
    (acc, action) => Object.assign({}, acc, {
      [action]: wrapMethod(
        action,
        Compressor.create({ filename })
      )
    }),
    {}
  )
);
