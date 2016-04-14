"use strict";

var util = require("util");
var _ = require("lodash/fp");

var Base = require("./base");

/**
 * Versions action abstraction.
 *
 * @returns {void}
 */
var Versions = function Versions() {
  Base.apply(this, arguments);
};

util.inherits(Versions, Base);

Versions.prototype.name = "versions";

Versions.prototype.textTemplate = _.template([
  "inspectpack --action=versions",
  "=============================",
  "",
  "## Summary",
  "",
  "TODO",
  ""
].join("\n"));

Versions.prototype.getData = function (callback) {
  var codes = this.bundle.codes;

  // Create data object.
  var data = _.flow(
    // Transform to list of all files for a given base name group key.
    _.groupBy(function (code) { return code.baseName; }),

    // Just get the full filepaths.
    _.mapValues(function (items) {
      return _.map(function (code) { return code.fileName; })(items);
    })
  )(codes);

  callback(null, data);
};

/**
 * Return list of version skews in packages from file bundle.
 *
 * @param {Object}    opts                  Options
 * @param {String}    opts.bundle           Bundle file path
 * @param {Array}     opts.root             Root path to project
 * @param {String}    opts.format           Output format type
 * @param {Boolean}   opts.verbose          Verbose output?
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Versions);

// TODO: Filter down to missed deduplication opportunities (???)
