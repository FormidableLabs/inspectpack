#!/usr/bin/env node
"use strict";

var args = require("../lib").args;
var actions = require("../lib").actions;

// The main event.
var main = function () {
  // Parse arguments.
  var parser = args.parse();
  var argv = args.validate(parser);

  // Invoke action.
  actions(argv.action)(argv, function (err, data) {
    if (err) {
      // Try to get full stack, then full string if not.
      console.error(err.stack || err.toString()); // eslint-disable-line no-console
    }

    if (data) {
      console.log(data); // eslint-disable-line no-console,no-magic-numbers
    }
  });
};

if (require.main === module) {
  main();
}
