#!/usr/bin/env node
"use strict";

const args = require("../lib").args;
const actions = require("../lib").actions;

// The main event.
const main = function () {
  // Parse arguments.
  const parser = args.parse();
  const argv = args.validate(parser);

  // Invoke action.
  actions(argv.action)(argv, (err, data) => {
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
