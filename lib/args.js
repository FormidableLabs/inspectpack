"use strict";

const pkg = require("../package.json");
const yargs = require("yargs");

const TERMINAL_CHARS = 100;
const NOT_FOUND = -1;

const ACTIONS = Object.keys(require("./actions").ACTIONS);

/**
 * Validation wrapper
 *
 * @param {Object} parser yargs parser object
 * @returns {void}
 */
const Validate = function Validate(parser) {
  this.parser = parser;
  this.argv = parser.argv;
};

Validate.prototype = {
  _fail(msgOrErr) {
    this.parser.showHelp();
    const err = msgOrErr instanceof Error ? msgOrErr : new Error(msgOrErr);
    throw err;
  },

  /*eslint-disable complexity,max-statements*/
  action() {
    const action = this.argv.action;

    if (!this.argv.bundle && ACTIONS.indexOf(action) === NOT_FOUND) {
      this._fail("Requires `--bundle` file");
    }

    if (action === "versions") {
      this.argv.root = this.argv.root || process.cwd();
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
  /*eslint-enable complexity,max-statements*/
};

// Args wrapper.
module.exports = {
  parse() {
    return yargs
      .usage(`${pkg.description }\n\nUsage: inspectpack --action=<string> [options]`)

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
        "inspectpack --action=versions --bundle=bundle.js --root=/PATH/TO/project",
        "Show version skews in a project"
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
      .option("root", {
        alias: "r",
        describe: "Project root (for `node_modules` introspection, default cwd)",
        type: "string"
      })

      // Display
      .option("format", {
        alias: "f",
        describe: "Display output format",
        type: "string",
        choices: ["json", "text", "tsv"],
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
      .option("allow-empty", {
        describe: "Allow unparseable / empty bundles",
        type: "boolean",
        default: false
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
      .option("duplicates", {
        describe: "Filter `--action=versions` to libraries that cannot be deduped",
        type: "boolean"
      })

      // Logistical
      .help().alias("help", "h")
      .version().alias("version", "v")
      .wrap(Math.min(TERMINAL_CHARS, yargs.terminalWidth()))
      .strict();
  },

  validate(parser) {
    return new Validate(parser)
      .action()
      .argv;
  }
};
