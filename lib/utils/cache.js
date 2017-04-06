"use strict";

const path = require("path");
const fs = require("fs");
const tmpdir = require("os").tmpdir;

const Promise = require("bluebird");
const mkdirp = Promise.promisify(require("mkdirp"));
const toPairs = require("lodash/fp/toPairs");

const DEFAULT_FILENAME = "default-cache.json";

const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);
const access = Promise.promisify(fs.access);

// Function adapted from:
// http://2ality.com/2015/08/es6-map-json.html#converting-a-string-map-to-and-from-an-object
function serializeMap(stringKeyedMap) {
  const plainObject = Object.create(null);
  for (const pair of stringKeyedMap.entries()) {
    const key = pair[0];
    const value = pair[1];
    plainObject[key] = value;
  }
  return JSON.stringify(plainObject);
}

// Adapted from interlock with permission:
// https://github.com/interlockjs/interlock/blob/master/src/optimizations/file-cache/index.js
function getCacheFilePath(opts) {
  const canonicalPath = opts.cacheDir || tmpdir();

  const initPath = opts.cacheDir
    ? mkdirp(canonicalPath)
    : Promise.resolve();

  return initPath
    // eslint-disable-next-line no-bitwise
    .then(() => access(canonicalPath, fs.R_OK | fs.W_OK))
    .then(() =>
      path.join(
        canonicalPath,
        opts.scope || DEFAULT_FILENAME
      ))
    .catch(() => {
      throw new Error(
        `Unable to access cache directory.
        Please check the directory's user permissions:
        ${canonicalPath}`
      );
    });
}

module.exports = class Cache {
  /**
   * Asynchronously create a new cache from disk.
   *
   * @param   {Object} opts                  Object options
   * @param   {Object} opts.scope            The prefix for this cache's file
   * @param   {Object} opts.cacheDir         The directory to store cache files
   * @returns {Promise<Cache>}               The hydrated cache
   */
  static init(opts) {
    opts = opts || {};

    return getCacheFilePath(opts)
      .then(filePath => readFile(filePath, "utf8"))
      .then(file => new Cache(opts, new Map(toPairs(JSON.parse(file)))))
      .catch(() => new Cache(opts));
  }

  /**
   * An in-memory cache that can serialize to, and deserialize from, disk.
   *
   * @param {Object} opts                  Object options
   * @param {Object} opts.scope            The prefix for this cache's file
   * @param {Object} opts.cacheDir         The directory to store cache files
   * @param {Map}    map                   An existing Map instance
   */
  constructor(opts, map) {
    this._opts = opts;
    this._cache = map || new Map();
  }

  /**
   * Save the cache to disk.
   *
   * @returns {void}
   */
  save() {
    return getCacheFilePath(this._opts).then(filePath =>
      writeFile(filePath, serializeMap(this._cache)));
  }

  /**
   * Retrive a value from the cache by key.
   *
   * @param   {string} key The key of the record to retrieve
   * @returns {any}    The cached value
   */
  get(key) {
    return this._cache.get(key) || null;
  }

  /**
   * Retrive a value from the cache by key.
   *
   * @param   {string}  key   The key of the record to set
   * @param   {any}     value The value to set
   * @returns {void}
   */
  set(key, value) {
    this._cache.set(key, value);
  }
};
