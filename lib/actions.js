"use strict";

const ACTIONS = {
  /*eslint-disable global-require*/
  duplicates: require("./actions/duplicates"),
  pattern: require("./actions/pattern"),
  parse: require("./actions/parse"),
  files: require("./actions/files"),
  versions: require("./actions/versions"),
  sizes: require("./actions/sizes")
  /*eslint-enable global-require*/
};

/**
 * Return action.
 *
 * @param   {String}    name  Action name
 * @returns {Function}        Action function
 */
module.exports = function (name) {
  const action = ACTIONS[name];
  if (!action) {
    // This is a programming error. Arg parsing _should_ have caught already.
    throw new Error(`Unknown action: ${name}`);
  }

  return action;
};

// Expose actions.
module.exports.ACTIONS = ACTIONS;
