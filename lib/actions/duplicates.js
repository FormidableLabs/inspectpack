"use strict";

var zlib = require("zlib");
var util = require("util");

var _ = require("lodash/fp");
var uglify = require("uglify-js");

var Base = require("./base");
var metaSum = require("../utils/data").metaSum;
var toParseable = require("../utils/code").toParseable;

var GZIP_OPTS = { level: 9 };

/**
 * Add full, minified, gzipped size data points.
 *
 * @param {Array}     codes         Indexed array of code sections
 * @param {Object}    opts          Options
 * @param {Boolean}   opts.minified Minified calculations / output?
 * @param {Boolean}   opts.gzip     Minified + gzipped calculations / output?
 * @return {Function}               Mutates object values
 */
var addSizes = function (codes, opts) {
  var minified = opts.minified || opts.gzip;
  var gzip = opts.gzip;

  return _.mapValues(function (group) {
    var meta = group.meta;

    // Track total sizes.
    var totalFullSize = 0;
    var totalMinSize = 0;
    var totalMinGzSize = 0;
    var minMinSize = null;
    var minMinGzSize = null;

    // Update summary items.
    _.each.convert({ cap: false })(function (obj, idx) {
      // Mutate sizes.
      var codeSrc = toParseable(codes[idx].code);
      var fullSize = codeSrc.length;
      var minSrc = minified ? uglify.minify(codeSrc, { fromString: true }).code : null;
      var minSize = minified ? minSrc.length : "--";
      var minGzSize = gzip ? zlib.gzipSync(minSrc, GZIP_OPTS).length : "--";

      // Update stateful aggregators.
      totalFullSize += fullSize;
      totalMinSize += minified ? minSize : "";
      totalMinGzSize += gzip ? minGzSize : "";

      // Heuristic: Say that the lowest size possible is the smallest code size.
      if (minified && (minMinSize === null || minSize < minMinSize)) {
        minMinSize = minSize;
      }
      if (gzip && (minMinGzSize === null || minGzSize < minMinGzSize)) {
        minMinGzSize = minGzSize;
      }

      // Mutate object.
      obj.size = {
        full: fullSize,
        min: minSize,
        minGz: minGzSize
      };
    })(meta.summary);

    // Aggregated sizes.
    meta.size = {
      full: totalFullSize,
      min: minified ? totalMinSize : "--",
      minExtra: minified ? totalMinSize - minMinSize : "--",
      minGz: gzip ? totalMinGzSize : "--",
      minGzExtra: gzip ? totalMinGzSize - minMinGzSize : "--"
    };

    return group;
  });
};

/**
 * Duplicates action abstraction.
 *
 * @returns {void}
 */
var Duplicates = function Duplicates() {
  Base.apply(this, arguments);
};

util.inherits(Duplicates, Base);

Duplicates.prototype.name = "duplicates";

Duplicates.prototype.textTemplate = _.template([
  "inspectpack --action=duplicates",
  "===============================",
  "",
  "## Summary",
  "",
  "* Bundle:",
  "    * Path:                    <%= opts.bundle %>",
  "    * Bytes (min):             <%= meta.bundle.min %>",
  "    * Bytes (min+gz):          <%= meta.bundle.minGz %>",
  "* Missed Duplicates:",
  "    * Num Unique Files:        <%= meta.numFilesWithDuplicates %>",
  "    * Num Extra Files:         <%= meta.numFilesExtra %>",
  "    * Extra Bytes (min):       <%= meta.size.minExtra %>",
  "    * Bundle Pct (min):        <%= opts.minified || opts.gzip ? " +
  " Math.round((meta.size.minExtra / meta.bundle.min) * 100) + ' %' : '--' %>",
  "    * Extra Bytes (min+gz):    <%= meta.size.minGzExtra %>",
  "    * Bundle Pct (min+gz):     <%= opts.gzip ? " +
  " Math.round((meta.size.minGzExtra / meta.bundle.minGz) * 100) + ' %' : '--' %>",
  "",
  "## Duplicates:",
  "<% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "* <%= fileName %>",
  "    * Num Duplicates:          <%= meta.uniqIdxs.length %>",
  "    * Current Bytes (min):     <%= meta.size.min %>",
  "    * Extra Bytes (min):       <%= meta.size.minExtra %>",
  "    * Current Bytes (min+gz):  <%= meta.size.minGz %>",
  "    * Extra Bytes (min+gz):    <%= meta.size.minGzExtra %>",
  "",
  "<% _.each.convert({ cap: false })(function (obj, idx) { %>" +
  "    * <%= idx %> (<%= obj.refs.length %>): <%= obj.source %>",
  "<% _.each(function (ref) { %>" +
  "        * <%= ref %>",
  "<% })(obj.refs); %>",
  "<% })((meta || meta.meta).summary); %>" + // Handle verbose.
  "<% })(data); %>",
  ""
].join("\n"));

Duplicates.prototype.tsvTemplate = _.template([
  "File\tDuplicates\tTotal Size (m)\tExtra Size (m)\tTotal Size (m+gz)\tExtra Size (m+gz)\n",
  "<% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "<%= fileName %>\t",
  "<%= meta.uniqIdxs.length %>\t",
  "<%= meta.size.min %>\t",
  "<%= meta.size.minExtra %>\t",
  "<%= meta.size.minGz %>\t",
  "<%= meta.size.minGzExtra %>\n",
  "<% })(data); %>",
  ""
].join(""));

Duplicates.prototype.getData = function (callback) {
  // Options.
  var opts = this.opts;
  var minified = opts.minified || opts.gzip;
  var gzip = opts.gzip;

  // Bundle.
  var bundle = this.bundle;
  var codes = bundle.codes;

  // Create data object.
  var data = _.flow(
    // Filter to actual missed duplicates.
    _.pickBy(function (g) {
      return g.meta.uniqIdxs.length > 1; // eslint-disable-line no-magic-numbers
    }),
    addSizes(codes, opts),
    // Filter to just `meta` unless verbose.
    _.mapValues(function (g) { return opts.verbose ? g : g.meta; })
  )(bundle.groups);

  // Add entire bundle metadata.
  var numFilesWithDuplicates = _.keys(data).length;
  var numAllFiles = metaSum("uniqIdxs.length")(data);
  var minSrc = minified ? uglify.minify(bundle.code, { fromString: true }).code : null;

  data.meta = {
    // Unique baseNames that have misses.
    numFilesWithDuplicates: numFilesWithDuplicates,
    // The number of extra files that we could reduce.
    numFilesExtra: numAllFiles - numFilesWithDuplicates,

    // Aggregate sizes.
    size: {
      full: metaSum("size.full")(data),
      min: minified ? metaSum("size.min")(data) : "--",
      minExtra: minified ? metaSum("size.minExtra")(data) : "--",
      minGz: gzip ? metaSum("size.minGz")(data) : "--",
      minGzExtra: gzip ? metaSum("size.minGzExtra")(data) : "--"
    },

    // The existing total bundle.
    bundle: {
      full: bundle.code.length,
      min: minified ? minSrc.length : "--",
      minGz: gzip ? zlib.gzipSync(minSrc, GZIP_OPTS).length : "--"
    }
  };

  callback(null, data);
};

/**
 * Detect duplicate libraries that are not actually deduped.
 *
 * See: https://github.com/webpack/webpack/blob/master/lib/optimize/DedupePlugin.js
 *
 * @param {Object}    opts          Options
 * @param {String}    opts.bundle   Bundle file path
 * @param {String}    opts.code     Raw bundle string
 * @param {String}    opts.format   Output format type
 * @param {Boolean}   opts.verbose  Verbose output?
 * @param {Boolean}   opts.minified Minified calculations / output?
 * @param {Boolean}   opts.gzip     Minified + gzipped calculations / output?
 * @param {Function}  callback      Form `(err, data)`
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Duplicates);

// Expose underlying class for direct use.
module.exports.Duplicates = Duplicates;

