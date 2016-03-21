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
  _fail: function (msgOrErr) {
    this.parser.showHelp();
    var err = msgOrErr instanceof Error ? msgOrErr : new Error(msgOrErr);
    throw err;
  },

  action: function () {
    var action = this.argv.action;
    var bundle = this.argv.bundle;

    if (action === "duplicates") {
      if (!bundle) {
        this._fail("Requires `--bundle` file");
      }
    }

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
        alias: "a",
        describe: "Actions to take",
        type: "string",
        choices: ["duplicates"],
        required: true
      })
      .example(
        "$0 --action=duplicates --bundle=bundle.js",
        "Report duplicates that cannot be deduped"
      )

      // Files
      .option("bundle", {
        alias: "b",
        describe: "Path to webpack-created JS bundle",
        type: "string"
      })

      // Display
      .option("format", {
        alias: "f",
        describe: "Display output format",
        type: "string",
        choices: ["json", "text"],
        default: "text"
      })

      // Misc.
      .option("verbose", {
        describe: "Verbose output",
        type: "boolean",
        default: false
      })
      .option("minified", {
        alias: "m",
        describe: "Calculate / display minified byte sizes",
        type: "boolean",
        default: true
      })

      // Logistical
      .help().alias("help", "h")
      .version().alias("version", "v")
      .wrap(Math.min(TERMINAL_CHARS, yargs.terminalWidth()))
      .strict();
  },

  validate: function (parser) {
    return new Validate(parser)
      .action()
      .argv;
  }
};
