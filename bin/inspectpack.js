#!/usr/bin/env node
"use strict";

var args = require("../lib").args;

var EXIT_ERROR = 1;

// The main event.
var main = function () {
  var parser = args.parse();
  var argv = args.validate(parser);
  if (!argv) {
    process.exit(EXIT_ERROR); // eslint-disable-line no-process-exit
  }

  console.log("TODO: IMPLEMENT CLI!"); // eslint-disable-line no-console
};

if (require.main === module) {
  main();
}
