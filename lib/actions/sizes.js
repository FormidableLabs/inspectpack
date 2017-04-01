"use strict";

const zlib = require("zlib");
const util = require("util");

const _ = require("lodash/fp");
const uglify = require("uglify-js");

const Base = require("./base");
const toParseable = require("../utils/code").toParseable;

const GZIP_OPTS = { level: 9 };

/**
 * Sizes action abstraction.
 *
 * @returns {void}
 */
const Sizes = function Sizes() {
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
  const opts = this.opts;
  const minified = opts.minified || opts.gzip;
  const gzip = opts.gzip;

  // Bundle.
  const bundle = this.bundle;
  const codes = bundle.codes;

  // Convert codes array to sizes array
  const sizes = _.map((obj) => {
    // Get code size for any type of chunk.
    // Reinflate ref (`123`) or refs (`[123, 345]`) for size analysis.
    let code = obj.code;
    if (!obj.isCode()) {
      const ref = obj.isSingleRef() ? obj.singleRef : obj.multiRefs;
      code = JSON.stringify(ref);
    }

    // Min+gz sizes.
    let minSize = "--";
    let minGzSize = "--";
    if (obj.isCode() && minified) {
      const codeSrc = toParseable(code);
      const minSrc = uglify.minify(codeSrc, {
        fromString: true,
        warnings: false,
        output: {
          // eslint-disable-next-line camelcase
          max_line_len: Infinity
        }
      }).code;
      minSize = minSrc.length;

      if (gzip) {
        minGzSize = zlib.gzipSync(minSrc, GZIP_OPTS).length;
      }
    }

    return {
      id: obj.id,
      baseName: obj.baseName,
      fileName: obj.fileName,
      type: obj.isTemplate ? "template" : obj.type,
      size: {
        full: code.length,
        min: obj.isCode() ? minSize : code.length,
        minGz: obj.isCode() ? minGzSize : code.length
      }
    };
  })(codes);

  const bundleMinSrc = minified ? uglify.minify(bundle.code, {
    fromString: true,
    warnings: false,
    output: {
      // eslint-disable-next-line camelcase
      max_line_len: Infinity
    }
  }).code : null;

  callback(null, {
    meta: {
      // The existing total bundle.
      bundle: {
        full: bundle.code.length,
        min: minified ? bundleMinSrc.length : "--",
        minGz: gzip ? zlib.gzipSync(bundleMinSrc, GZIP_OPTS).length : "--"
      }
    },
    sizes
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
