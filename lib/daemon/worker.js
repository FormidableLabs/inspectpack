"use strict";

const workerpool = require("workerpool");

const actions = require("../actions");
const Compressor = require("../utils/compressor");

Promise.all(
  Object.keys(actions.ACTIONS).map(action =>
    Compressor.init({
      scope: `${action}-compressor`
    }).then(compressor => ({
      [action]: args =>
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
          ))
    })))
)
  .then(actionMaps =>
    actionMaps.reduce((acc, map) => Object.assign({}, acc, map), {}))
  .then(workerpool.worker);
