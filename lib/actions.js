"use strict";

var ACTIONS = {
  /*eslint-disable global-require*/
  duplicates: require("./actions/duplicates"),
  files: require("./actions/files"),
  versions: require("./actions/versions"),
  pattern: require("./actions/pattern")
  /*eslint-enable global-require*/
};

/**
 * Return action.
 *
 * @param   {String}    name  Action name
 * @returns {Function}        Action function
 */
module.exports = function (name) {
  var action = ACTIONS[name];
  if (!action) {
    // This is a programming error. Arg parsing _should_ have caught already.
    throw new Error("Unknown action: " + name);
  }

  return action;
};
