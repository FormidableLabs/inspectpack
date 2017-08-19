"use strict";

const zlib = require("zlib");
const util = require("util");

const _ = require("lodash/fp");
const uglify = require("uglify-es");

const Base = require("./base");
const metaSum = require("../utils/data").metaSum;
const toParseable = require("../utils/code").toParseable;

const GZIP_OPTS = { level: 9 };

/**
 * Add full, minified, gzipped size data points.
 *
 * @param {Array}     codes         Indexed array of code sections
 * @param {Object}    opts          Options
 * @param {Boolean}   opts.minified Minified calculations / output?
 * @param {Boolean}   opts.gzip     Minified + gzipped calculations / output?
 * @return {Function}               Mutates object values
 */
const addSizes = function (codes, opts) {
  const minified = opts.minified || opts.gzip;
  const gzip = opts.gzip;

  return _.mapValues((group) => {
    const meta = group.meta;

    // Track total sizes.
    let totalFullSize = 0;
    let totalMinSize = 0;
    let totalMinGzSize = 0;
    let minMinSize = null;
    let minMinGzSize = null;

    // Update summary items.
    _.each.convert({ cap: false })((obj, idx) => {
      // Mutate sizes.
      const codeSrc = toParseable(_.find({ id: idx })(codes).code);
      const fullSize = codeSrc.length;
      const minSrc = minified ? uglify.minify(codeSrc, {
        warnings: false,
        output: {
          // eslint-disable-next-line camelcase
          max_line_len: Infinity
        }
      }).code : null;
      const minSize = minified ? minSrc.length : "--";
      const minGzSize = gzip ? zlib.gzipSync(minSrc, GZIP_OPTS).length : "--";

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
const Duplicates = function Duplicates() {
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
  const opts = this.opts;
  const minified = opts.minified || opts.gzip;
  const gzip = opts.gzip;

  // Bundle.
  const bundle = this.bundle;
  const codes = bundle.codes;

  // Create data object.
  const data = _.flow(
    // Filter to actual missed duplicates.
    _.pickBy((g) => {
      return g.meta.uniqIdxs.length > 1; // eslint-disable-line no-magic-numbers
    }),
    addSizes(codes, opts),
    // Filter to just `meta` unless verbose.
    _.mapValues((g) => { return opts.verbose ? g : g.meta; })
  )(bundle.groups);

  // Add entire bundle metadata.
  const numFilesWithDuplicates = _.keys(data).length;
  const numAllFiles = metaSum("uniqIdxs.length")(data);
  const minSrc = minified ? uglify.minify(bundle.code, {
    warnings: false,
    output: {
      // eslint-disable-next-line camelcase
      max_line_len: Infinity
    }
  }).code : null;

  data.meta = {
    // Unique baseNames that have misses.
    numFilesWithDuplicates,
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

