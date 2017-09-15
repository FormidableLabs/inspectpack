"use strict";

const util = require("util");
const _ = require("lodash/fp");

const Base = require("./base");
const Compressor = require("../utils/compressor");
const toParseable = require("../utils/code").toParseable;

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

Sizes.prototype.textTemplate = _.template(
  [
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
  ].join("\n")
);

Sizes.prototype.tsvTemplate = _.template(
  [
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
  ].join("")
);

const getModuleSize = (obj, opts) => {
  const minified = opts.minified;
  const gzip = opts.gzip;

  // Get code size for any type of chunk.
  // Reinflate ref (`123`) or refs (`[123, 345]`) for size analysis.
  let code = obj.code;
  if (!obj.isCode()) {
    const ref = obj.isSingleRef() ? obj.singleRef : obj.multiRefs;
    code = JSON.stringify(ref);
  }

  return opts.compressor
    .getSizes({
      source: toParseable(code),
      minified,
      gzip
    })
    .then((sizes) => ({
      id: obj.id,
      baseName: obj.baseName,
      fileName: obj.fileName,
      type: obj.isTemplate ? "template" : obj.type,
      size: {
        full: sizes.full,
        min: obj.isCode() ? sizes.min : code.length,
        minGz: obj.isCode() ? sizes.minGz : code.length
      }
    }));
};

Sizes.prototype.getData = function (callback) {
  // Options.
  const opts = this.opts;
  const compressor = opts.compressor || new Compressor();
  const minified = opts.minified || opts.gzip;
  const gzip = opts.gzip;

  // Bundle.
  const bundle = this.bundle;
  const codes = bundle.codes;

  // Convert codes array to sizes array
  Promise.all(
    codes.map((code) =>
      getModuleSize(code, {
        compressor,
        minified,
        gzip
      }))
  )
    .then((sizes) =>
      Promise.all([
        sizes,
        compressor.getSizes({
          source: bundle.code,
          minified,
          gzip
        })
      ]))
    .then((result) => ({
      meta: {
        // The existing total bundle.
        bundle: result[1]
      },
      sizes: result[0]
    }))
    .then((sizes) => callback(null, sizes))
    .catch((err) => callback(err, null));
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
