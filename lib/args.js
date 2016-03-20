"use strict";

var pkg = require("../package.json");
var yargs = require("yargs");

var TERMINAL_CHARS = 100;

/**
 * Validation wrapper
 *
 * @param {Object} parser yargs parser object
 * @returns {void}
 */
var Validate = function Validate(parser) {
  this.parser = parser;
  this.argv = parser.argv;
};

Validate.prototype = {
  _fail: function (msg) {
    this.parser.showHelp();
    console.error("Error: " + msg); // eslint-disable-line no-console
    return false;
  },

  action: function () {
    // TODO: Implement actions

    return this;
  }
};

// Args wrapper.
module.exports = {
  parse: function () {
    return yargs
      .usage(pkg.description + "\n\nUsage: $0 --action=<string> [options]")

      // Actions
      .option("action", {
        describe: "Actions to take",
        type: "string"
        // ,
        // choices: ["duplicates"],
        // required: true
      })

      // Files
      .option("stats", {
        alias: "s",
        describe: "Path to transform webpack `--stats` file",
        type: "string"
      })

      // Display
      .option("format", {
        describe: "Display output format",
        type: "string",
        choices: ["json", "text"],
        default: "json"
      })

      // Logistical
      .help().alias("h", "help")
      .version().alias("v", "version")
      .wrap(Math.min(TERMINAL_CHARS, yargs.terminalWidth()))
      .strict();
  },

  validate: function (parser) {
    return new Validate(parser)
      // TODO: Add other validation
      .action()
      .argv;
  }
};
