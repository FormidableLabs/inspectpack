"use strict";

var zlib = require("zlib");
var _ = require("lodash/fp");
var uglify = require("uglify-js");

var Bundle = require("../models/bundle");

var JSON_SPACES = 2;
var GZIP_OPTS = { level: 9 };

// Helper: Prep code source for minification.
var _getCodeSource = function (codes, idx) {
  // Uglify doesn't like raw functions like:
  // `function(module, exports, __webpack_require__) {}` -> `undefined`,
  // so we prepend a variable to make it happy:
  // `a=function(module, exports, __webpack_require__) {}` -> `a=function(a,b,c){};`,
  var pad = "a=";
  return pad + codes[idx].code.trim().replace(/,$/, "");
};

/**
 * Convert codes into groups of baseName, file types.
 *
 * @return {Function} Converts array to object
 */
var groupByType = function () {
  return _.flow(
    // Group by the base library name.
    _.groupBy(function (code) { return code.baseName; }),

    // Group into code, template, ref, refs.
    _.mapValues(function (codes) {
      return {
        code: _.filter({ isCode: true, isTemplate: false })(codes),
        template: _.filter({ isTemplate: true })(codes),
        ref: _.flow(
          _.filter(function (code) { return code.ref !== null; }),
          _.map(function (code) { return _.omit("code")(code); })
        )(codes),
        refs: _.flow(
          _.filter(function (code) { return code.refs !== null; }),
          _.map(function (code) { return _.omit("code")(code); })
        )(codes)
      };
    })
  );
};

/**
 * Add metadata for duplicate inference.
 *
 * @param {Array}   codes Indexed array of code sections
 * @return {Function}     Mutates object values
 */
var addMetadata = function (codes) {
  var codesToFileNames = _.mapValues(_.map(function (code) { return code.fileName; }));

  return _.mapValues(function (group) {
    // All of the indexes for ultimate references.
    var meta = {
      // Code indexes for this group.
      codeIdxs: _.flow(
        _.groupBy(function (code) { return code.index; }),
        codesToFileNames
      )(group.code),

      // Unique internal/external code references for the group.
      refIdxs: _.flow(
        _.groupBy(function (code) { return code.ref; }),
        codesToFileNames
      )(group.ref),

      // External template references for the group.
      //
      // The **first** element of a multi-refs array
      // refers to a template that contains the code involved.
      refsIdxs: _.flow(
        _.groupBy(function (code) { return _.first(code.refs); }),
        codesToFileNames
      )(group.refs)
    };

    // More than one unique of _any_ means missed duplicates.
    meta.uniqIdxs = _.flow(
      _.map(function (i) { return parseInt(i); }),
      _.uniq
    )([].concat(
      _.keys(meta.codeIdxs),
      _.keys(meta.refIdxs),
      _.keys(meta.refsIdxs)
    ));

    // Track total sizes.
    var totalFullSize = 0;

    // Summary. Mostly for display.
    meta.summary = _.flow(
      _.map(function (idx) {
        var codePath = meta.codeIdxs[idx] ? _.first(meta.codeIdxs[idx]) : null;
        var codeSize = _getCodeSource(codes, idx).length;

        // Update stateful aggregators.
        totalFullSize += codeSize;

        return [idx, {
          source: codePath || "TEMPLATE",
          refs: _.uniq([].concat(
            meta.refIdxs[idx] || [],
            meta.refsIdxs[idx] || []
          )),
          size: {
            full: codeSize
          }
        }];
      }),

      _.fromPairs
    )(meta.uniqIdxs);

    // Aggregated sizes.
    meta.size = {
      full: totalFullSize
    };

    return _.extend({ meta: meta }, group);
  });
};

/**
 * Add minified, gzipped data points.
 *
 * @param {Array}     codes         Indexed array of code sections
 * @param {Object}    opts          Options
 * @param {Boolean}   opts.minified Minified calculations / output?
 * @param {Boolean}   opts.gzip     Minified + gzipped calculations / output?
 * @return {Function}               Mutates object values
 */
var addOptimized = function (codes, opts) {
  var minified = opts.minified || opts.gzip;
  var gzip = opts.gzip;

  return _.mapValues(function (group) {
    var meta = group.meta;

    // Track total sizes.
    var totalMinSize = 0;
    var totalMinGzSize = 0;
    var minMinSize = null;
    var minMinGzSize = null;

    // Update summary items.
    _.each(function (obj, idx) {
      // Mutate sizes.
      var codeSrc = _getCodeSource(codes, idx);
      var minSrc = minified ? uglify.minify(codeSrc, { fromString: true }).code : null;
      var minSize = minified ? minSrc.length : "--";
      var minGzSize = gzip ? zlib.gzipSync(minSrc, GZIP_OPTS).length : "--";

      // Update stateful aggregators.
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
      obj.size.min = minSize;
      obj.size.minGz = minGzSize;
    })(meta.summary);

    // Aggregated sizes.
    meta.size = _.extend(meta.size, {
      min: minified ? totalMinSize : "--",
      minExtra: minified ? totalMinSize - minMinSize : "--",
      minGz: gzip ? totalMinGzSize : "--",
      minGzExtra: gzip ? totalMinGzSize - minMinGzSize : "--"
    });

    return group;
  });
};

/**
 * Validate assumptions about duplicates.
 *
 * @param {Array} codes Indexed array of code sections
 * @return {Function}   Iterator for grouped object
 */
var validate = function (codes) {
  /*eslint-disable max-statements*/ // Validation can be long and tortured.
  return _.mapValues(function (group) {
    // Templates: Should not have any code, ref, or refs.
    var tmplLen = group.template.length;
    if (group.template.length) {
      if (tmplLen !== 1) { // eslint-disable-line no-magic-numbers
        // Same base name should never have more than 1 template.
        throw new Error("Found 2+ templates: " + JSON.stringify(group));
      } else if (group.code.length || group.ref.length || group.refs.length) {
        throw new Error("Found template with code|ref|refs: " + JSON.stringify(group));
      }

      return group;
    }

    // Check single references. Should have at most _one_ other ref, which
    // is a different **code** class.
    //
    // For instance, in lodash, have seen:
    // -  `684:lodash/internal/baseProperty.js` -> code
    // -  `960:lodash/_baseProperty.js` -> number `684`
    // - `2203:lodash/_baseProperty.js` -> number `684`
    // - `2409:lodash/_baseProperty.js` -> number `684`
    var extraRef = _.difference(group.meta.refIdxs, group.meta.codeIdxs);
    if (extraRef.length === 1) { // eslint-disable-line no-magic-numbers
      // Look up and check the extra item.
      var refItem = codes[_.first(extraRef)];
      if (!refItem.isCode) {
        throw new Error("Found non-code reference: " + JSON.stringify(refItem) +
          "\nFor: " + JSON.stringify(group));
      }

    } else if (extraRef.length > 1) { // eslint-disable-line no-magic-numbers
      throw new Error("2+ extra ref indexes: " + JSON.stringify(extraRef) +
        "\nItem: " + JSON.stringify(group));
    }

    // Check multi-references.
    //
    // Here, we _can_ have 2+ templates, which are missed duplicates.
    var refsIdxs = _.flow(
      _.map(function (code) { return _.first(code.refs); }),
      _.uniq
    )(group.refs);

    if (refsIdxs.length) {
      // Each refs index should be a template.
      _.each(function (refsIdx) {
        var refsItem = codes[refsIdx];
        if (!refsItem.isTemplate) {
          throw new Error("Found non-template reference: " + JSON.stringify(refsItem) +
            "\nFor: " + JSON.stringify(group));
        }
      })(refsIdxs);
    }

    return group;
  });
};

var textTmpl = _.template([
  "inspectpack --action=duplicates",
  "===============================",
  "",
  "## Summary",
  "",
  "* Bundle:",
  "    * Path:                    <%- opts.bundle %>",
  "    * Bytes (min):             <%- meta.bundle.min %>",
  "    * Bytes (min+gz):          <%- meta.bundle.minGz %>",
  "* Missed Duplicates:",
  "    * Num Unique Files:        <%- meta.numFilesWithDuplicates %>",
  "    * Num Extra Files:         <%- meta.numFilesExtra %>",
  "    * Extra Bytes (min):       <%- meta.size.minExtra %>",
  "    * Bundle Pct (min):        <%- opts.minified || opts.gzip ? " +
  " Math.round((meta.size.minExtra / meta.bundle.min) * 100) + ' %' : '--' %>",
  "    * Extra Bytes (min+gz):    <%- meta.size.minGzExtra %>",
  "    * Bundle Pct (min+gz):     <%- opts.gzip ? " +
  " Math.round((meta.size.minGzExtra / meta.bundle.minGz) * 100) + ' %' : '--' %>",
  "",
  "## Duplicates",
  "<% _.each(function (meta, fileName) { %>",
  "* <%- fileName %>",
  "    * Num Duplicates:          <%- meta.uniqIdxs.length %>",
  "    * Current Bytes (min):     <%- meta.size.min %>",
  "    * Extra Bytes (min):       <%- meta.size.minExtra %>",
  "    * Current Bytes (min+gz):  <%- meta.size.minGz %>",
  "    * Extra Bytes (min+gz):    <%- meta.size.minGzExtra %>",
  "",
  "<% _.each(function (obj, idx) { %>" +
  "    * <%- idx %> (<%- obj.refs.length %>): <%- obj.source %>",
  "<% _.each(function (ref) { %>" +
  "        * <%- ref %>",
  "<% })(obj.refs); %>",
  "<% })((meta || meta.meta).summary); %>" + // Handle verbose.
  "<% })(data); %>",
  ""
].join("\n"));

/**
 * Format for display.
 *
 * @param   {Object}  opts        Options object
 * @param   {Object}  duplicates  Duplicates data object
 * @returns {String}              Formatted string
 */
var display = function (opts, duplicates) {
  var format = opts.format;

  if (format === "json") {
    return JSON.stringify(duplicates, null, JSON_SPACES);
  } else if (format === "text") {
    return textTmpl({
      opts: opts,
      data: _.omit("meta")(duplicates),
      meta: duplicates.meta
    });
  }

  // Programming error.
  throw new Error("Unknown format: " + format);
};

// Helper: Sum up properties from a meta object.
var metaSum = function (props) {
  return _.reduce(function (m, g) {
    return m + _.get(props)(g.meta || g);
  }, 0); // eslint-disable-line no-magic-numbers
};

/**
 * Detect duplicate libraries that are not actually deduped.
 *
 * See: https://github.com/webpack/webpack/blob/master/lib/optimize/DedupePlugin.js
 *
 * @param {Object}    opts          Options
 * @param {String}    opts.bundle   Bundle file path
 * @param {String}    opts.format   Output format type
 * @param {Boolean}   opts.verbose  Verbose output?
 * @param {Boolean}   opts.minified Minified calculations / output?
 * @param {Boolean}   opts.gzip     Minified + gzipped calculations / output?
 * @param {Function}  callback      Form `(err, data)`
 * @returns {void}
 */
module.exports = function (opts, callback) {
  var minified = opts.minified || opts.gzip;
  var gzip = opts.gzip;

  Bundle.create(opts, function (err, bundle) {
    if (err) {
      callback(err);
      return;
    }

    // Create duplicates object.
    var codes = bundle.codes;
    var duplicates = _.flow(
      groupByType(),
      addMetadata(codes),
      validate(codes),
      // Filter to actual missed duplicates.
      _.pickBy(function (g) {
        return g.meta.uniqIdxs.length > 1; // eslint-disable-line no-magic-numbers
      }),
      addOptimized(codes, opts),
      // Filter to just `meta` unless verbose.
      _.mapValues(function (g) { return opts.verbose ? g : g.meta; })
    )(codes);

    // Add entire bundle metadata.
    var numFilesWithDuplicates = _.keys(duplicates).length;
    var numAllFiles = metaSum("uniqIdxs.length")(duplicates);
    var minSrc = minified ? uglify.minify(bundle.code, { fromString: true }).code : null;

    duplicates.meta = {
      // Unique baseNames that have misses.
      numFilesWithDuplicates: numFilesWithDuplicates,
      // The number of extra files that we could reduce.
      numFilesExtra: numAllFiles - numFilesWithDuplicates,

      // Aggregate sizes.
      size: {
        full: metaSum("size.full")(duplicates),
        min: minified ? metaSum("size.min")(duplicates) : "--",
        minExtra: minified ? metaSum("size.minExtra")(duplicates) : "--",
        minGz: gzip ? metaSum("size.minGz")(duplicates) : "--",
        minGzExtra: gzip ? metaSum("size.minGzExtra")(duplicates) : "--"
      },

      // The existing total bundle.
      bundle: {
        full: bundle.code.length,
        min: minified ? minSrc.length : "--",
        minGz: gzip ? zlib.gzipSync(minSrc, GZIP_OPTS).length : "--"
      }
    };

    // Format for display.
    var data = display(opts, duplicates);

    callback(null, data);
  });
};
