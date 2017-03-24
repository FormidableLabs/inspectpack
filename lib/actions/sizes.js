"use strict";

var zlib = require("zlib");
var util = require("util");

var _ = require("lodash/fp");
var uglify = require("uglify-js");

var Base = require("./base");
var toParseable = require("../utils/code").toParseable;

var GZIP_OPTS = { level: 9 };

/**
 * Sizes action abstraction.
 *
 * @returns {void}
 */
var Sizes = function Sizes() {
  Base.apply(this, arguments);
};

util.inherits(Sizes, Base);

Sizes.prototype.name = "duplicates";

Sizes.prototype.textTemplate = _.template([
  "inspectpack --action=sizes",
  "==========================",
  "",
  "## Summary",
  "",
  "* Bundle:",
  "    * Path:                    <%= opts.bundle %>",
  "    * Bytes (min):             <%= meta.bundle.min %>",
  "    * Bytes (min+gz):          <%= meta.bundle.minGz %>",
  "",
  "## Files                  <% _.each(function (obj) { %>",
  "<%= obj.index %>. <%= obj.fileName %>",
  "  * Type:          <%= obj.type %>",
  "  * Size:          <%= obj.size.full %>",
  "  * Size (min):    <%= obj.size.min %>",
  "  * Size (min+gz): <%= obj.size.minGz %>",
  "<% })(data.sizes); %>",
  "",
  ""
].join("\n"));

Sizes.prototype.tsvTemplate = _.template([
  "Index\tFull Name\tShort Name\tType\tSize\tSize (min)\tSize (min+gz)\n",
  "<% _.each(function (obj) { %>",
  "<%= obj.index %>\t",
  "<%= obj.fileName %>\t",
  "<%= obj.baseName %>\t",
  "<%= obj.type %>\t",
  "<%= obj.size.full %>\t",
  "<%= obj.size.min %>\t",
  "<%= obj.size.minGz %>\n",
  "<% })(data.sizes); %>"
].join(""));

Sizes.prototype.getData = function (callback) {
  // Options.
  var opts = this.opts;
  var minified = opts.minified || opts.gzip;
  var gzip = opts.gzip;

  // Bundle.
  var bundle = this.bundle;
  var codes = bundle.codes;

  // Convert codes array to sizes array
  var sizes = _.map(function (obj) {
    // Get code size for any type of chunk.
    // Reinflate ref (`123`) or refs (`[123, 345]`) for size analysis.
    var code = obj.code;
    if (!obj.isCode) {
      var ref = _.isNumber(obj.ref) ? obj.ref : obj.refs;
      code = JSON.stringify(ref);
    }

    // Min+gz sizes.
    var minSize = "--";
    var minGzSize = "--";
    if (obj.isCode && minified) {
      var codeSrc = toParseable(code);
      var minSrc = uglify.minify(codeSrc, { fromString: true }).code;
      minSize = minSrc.length;

      if (gzip) {
        minGzSize = zlib.gzipSync(minSrc, GZIP_OPTS).length;
      }
    }

    return {
      index: obj.index,
      baseName: obj.baseName,
      fileName: obj.fileName,
      type: obj.isTemplate ? "template" : // eslint-disable-line no-nested-ternary
        obj.isCode ? "code" :
        "reference",
      size: {
        full: code.length,
        min: obj.isCode ? minSize : code.length,
        minGz: obj.isCode ? minGzSize : code.length
      }
    };
  })(codes);

  var bundleMinSrc = minified ? uglify.minify(bundle.code, { fromString: true }).code : null;

  callback(null, {
    meta: {
      // The existing total bundle.
      bundle: {
        full: bundle.code.length,
        min: minified ? bundleMinSrc.length : "--",
        minGz: gzip ? zlib.gzipSync(bundleMinSrc, GZIP_OPTS).length : "--"
      }
    },
    sizes: sizes
  });
};

/**
 * Output all files with size information.
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
module.exports = Base.createWithBundle.bind(Sizes);
