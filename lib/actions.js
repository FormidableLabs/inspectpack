"use strict";

var ACTIONS = {
  /*eslint-disable global-require*/
  duplicates: require("./actions/duplicates"),
  pattern: require("./actions/pattern"),
  parse: require("./actions/parse"),
  files: require("./actions/files")
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
