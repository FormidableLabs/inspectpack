"use strict";

const uglify = require("uglify-es");
const zlib = require("zlib");

const Cache = require("./cache");

const DEFAULT_UGLIFY_OPTS = {
  warnings: false,
  output: {
    // eslint-disable-next-line camelcase
    max_line_len: Infinity
  }
};

const DEFAULT_GZIP_OPTS = { level: 9 };

const gzip = (opts) =>
  new Promise((resolve, reject) =>
    zlib.gzip(
      opts.source,
      opts.gzipOpts || DEFAULT_GZIP_OPTS,
      (err, buffer) => err ? reject(err) : resolve(buffer)
    ));

const minify = (opts) =>
  Promise.resolve(
    uglify.minify(opts.source, opts.uglifyOpts || DEFAULT_UGLIFY_OPTS)
  );

const getGzipLength = (opts) => gzip(opts).then((buffer) => buffer.length);

const getMinifiedLength = (opts) =>
  minify(opts).then((result) => result.code && result.code.length);

module.exports = class Compressor {
  /**
   * Start the compressor with a cache.
   *
   * @param   {Object} opts         Object options
   * @param   {Object} opts.cache   Cache instance
   * @returns {Compressor}          The compressor with cache
   */
  static create(opts) {
    return new Compressor(opts);
  }

  /**
   * A centralized manager for uglifying, gzipping, and retrieving file sizes.
   *
   * @param   {Object} opts          Object options
   * @param   {Object} opts.cache    Cache instance
   * @returns {void}
   */
  constructor(opts) {
    this._cache = (opts || {}).cache || Cache.NoopCache.create();
  }

  /**
   * Retrieve full source size with optional min+gz sizes attached
   *
   * @param   {Object}          opts            Object options
   * @param   {boolean}         opts.minified   When true, includes minified length
   * @param   {boolean}         opts.gzip       When true, includes gzipped length
   * @param   {Object}          opts.uglifyOpts Options to pass to uglify
   * @param   {Object}          opts.gzipOpts   Options to pass to gzip
   *
   * @returns {Promise<Object>} The aggregated code size statistics
   */
  getSizes(opts) {
    return this._cache.wrapAction({
      action: this._calculateSizes.bind(this)
    })(opts);
  }

  _calculateSizes(opts) {
    const sizes = {
      full: opts.source.length,
      min: "--",
      minGz: "--"
    };

    if (!opts.minified && !opts.gzip) {
      return Promise.resolve(sizes);
    }

    if (opts.minified && !opts.gzip) {
      return getMinifiedLength(opts).then((min) =>
        Object.assign({}, sizes, { min }));
    }

    return minify(opts)
      .then((result) => {
        if (result.error) {
          return Promise.reject(result.error);
        }

        return getGzipLength(
          Object.assign({}, opts, {
            source: result.code
          })
        ).then((minGz) =>
          Object.assign({}, sizes, {
            min: result.code.length,
            minGz
          }));
      });
  }
};
