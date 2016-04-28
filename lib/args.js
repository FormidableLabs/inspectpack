"use strict";

var pkg = require("../package.json");
var yargs = require("yargs");

var TERMINAL_CHARS = 100;
var NOT_FOUND = -1;

var ACTIONS = [
  "duplicates",
  "files",
  "parse",
  "pattern"
];

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

    if (!this.argv.bundle && ACTIONS.indexOf(action) === NOT_FOUND) {
      this._fail("Requires `--bundle` file");
    }

    if (action === "pattern") {
      if (!(this.argv.pattern.length || this.argv.suspectPatterns)) {
        this._fail("Requires 1+ `--pattern` strings or `--suspect-patterns`");
      }
    }

    if (action === "parse") {
      if (!(this.argv.path.length || this.argv.suspectParses)) {
        this._fail("Requires 1+ `--path` paths or `--suspect-parses`");
      }
    }

    if (action === "files") {
      if (!(this.argv.pattern.length || this.argv.suspectFiles)) {
        this._fail("Requires 1+ `--pattern` strings or `--suspect-files`");
      }
    }

    return this;
  }
};

// Args wrapper.
module.exports = {
  parse: function () {
    return yargs
      .usage(pkg.description + "\n\nUsage: inspectpack --action=<string> [options]")

      // Actions
      .option("action", {
        alias: "a",
        describe: "Actions to take",
        type: "string",
        choices: ACTIONS,
        required: true
      })
      .example(
        "inspectpack --action=duplicates --bundle=bundle.js",
        "Report duplicates that cannot be deduped"
      )
      .example(
        "inspectpack --action=pattern --bundle=bundle.js --suspect-patterns",
        "Show files with pattern matches in code"
      )
      .example(
        "inspectpack --action=parse --bundle=bundle.js --suspect-parses",
        "Show files with parse function matches in code"
      )
      .example(
        "inspectpack --action=files --bundle=bundle.js --suspect-files",
        "Show files with pattern matches in file names"
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
      .option("gzip", {
        alias: "g",
        describe: "Calculate / display minified + gzipped byte size (implies `--minified`)",
        type: "boolean",
        default: true
      })
      .option("pattern", {
        alias: "p",
        describe: "Regular expression string(s) to match on",
        type: "array",
        default: []
      })
      .option("path", {
        describe: "Path to input file(s)",
        type: "array",
        default: []
      })
      .option("suspect-patterns", {
        describe: "Known 'suspicious' patterns for `--action=pattern`",
        type: "boolean"
      })
      .option("suspect-parses", {
        describe: "Known 'suspicious' code parses for `--action=parse`",
        type: "boolean"
      })
      .option("suspect-files", {
        describe: "Known 'suspicious' file names for `--action=files`",
        type: "boolean"
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
