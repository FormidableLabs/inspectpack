"use strict";

const farmhash = require("farmhash");
const uglify = require("uglify-js");
const zlib = require("zlib");

const Cache = require("./cache");

const DEFAULT_UGLIFY_OPTS = {
  fromString: true,
  warnings: false,
  output: {
    // eslint-disable-next-line camelcase
    max_line_len: Infinity
  }
};

const DEFAULT_GZIP_OPTS = { level: 9 };

const gzip = opts =>
  new Promise((resolve, reject) =>
    zlib.gzip(
      opts.source,
      opts.gzipOpts || DEFAULT_GZIP_OPTS,
      (err, buffer) => {
        if (err) {
          return reject(err);
        }
        return resolve(buffer);
      }
    ));

const minify = opts =>
  Promise.resolve(
    uglify.minify(opts.source, opts.uglifyOpts || DEFAULT_UGLIFY_OPTS)
  );

const getGzipLength = opts => gzip(opts).then(buffer => buffer.length);

const getMinifiedLength = opts =>
  minify(opts).then(result => result.code && result.code.length);

module.exports = class Compressor {
  constructor(cache) {
    this._cache = cache || null;
  }

  static init(opts) {
    opts = opts || {};

    return Cache.init({
      scope: opts.scope,
      cacheDir: opts.cacheDir
    }).then(cache => new Compressor(cache));
  }

  saveCache() {
    if (this._cache) {
      this._cache.save();
    }
  }

  getSizes(opts) {
    const hashedKey = farmhash.hash64(JSON.stringify(opts));

    if (this._cache) {
      const cachedValue = this._cache.get(hashedKey);
      if (cachedValue) {
        return Promise.resolve(cachedValue);
      }
    }

    const sizes = {
      full: opts.source.length,
      min: "--",
      minGz: "--"
    };

    if (!opts.minified && !opts.gzip) {
      return Promise.resolve(sizes);
    }

    if (opts.minified && !opts.gzip) {
      return getMinifiedLength(opts).then(min =>
        Object.assign({}, sizes, { min }));
    }

    return minify(opts)
      .then(result =>
        Promise.all([
          Promise.resolve(result.code.length),
          getGzipLength(
            Object.assign({}, opts, {
              source: result.code
            })
          )
        ]).then(compressedSizes =>
          Object.assign({}, sizes, {
            min: compressedSizes[0],
            minGz: compressedSizes[1]
          })))
      .then(fullSizes => {
        if (this._cache) {
          this._cache.set(hashedKey, fullSizes);
          this._cache.save();
        }
        return fullSizes;
      });
  }
};
