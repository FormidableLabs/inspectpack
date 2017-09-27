"use strict";
/*eslint-disable lodash-fp/prefer-constant*/

const _ = require("lodash/fp");
let Database;
try {
  Database = require("better-sqlite3"); // eslint-disable-line global-require
} catch (err) { /* passthrough */ }

const SafeJSON = require("./safe-json");

const DEFAULT_DATABASE = ".inspectpack-cache.db";

const CREATE_TABLE_QUERY = "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT);";
const GET_QUERY = "SELECT value FROM cache WHERE key IS $key;";
const SET_QUERY = "INSERT OR REPLACE INTO cache (key, value) VALUES ($key, $value);";

class NoopCache {
  static create() { return new NoopCache(); }
  get() { return null; }
  set() {}
}

class SqliteCache {
  /**
   * Asynchronously create a new cache from disk.
   *
   * @param   {Object}   opts           Object options
   * @param   {String}   opts.filename  The filename of the SQLite database
   * @param   {String}   opts.name      A name for this instance used in debugging
   * @returns {Cache}                   The hydrated cache or noop cache on error
   */
  static create(opts) {
    opts = opts || {};

    try {
      const db = new Database(opts.filename || DEFAULT_DATABASE);
      // WAL mode ensures safe multiprocess access
      db.pragma("journal_mode = WAL");
      db.prepare(CREATE_TABLE_QUERY).run();
      return new SqliteCache(opts, db);
    } catch (err) {
      return new NoopCache();
    }
  }

  /**
   * An in-memory cache that can serialize to, and deserialize from, disk.
   *
   * @param {Object}   opts           Object options
   * @param {String}   opts.filename  The filename of the SQLite databases
   * @param {String}   opts.name      A name for this instance used in debugging
   * @param {Database} db             An existing SQLite database cursor
   */
  constructor(opts, db) {
    this._opts = opts;
    this._db = db;
  }

  /**
   * Retrive a value from the cache by key.
   *
   * @param   {string} key The key of the record to retrieve
   * @returns {any}    The cached value
   */
  get(key) {
    try {
      const record = this._db.prepare(GET_QUERY).get({ key });
      return _.flow(
        _.get("value"),
        SafeJSON.parse
      )(record);
    } catch (err) {
      return null;
    }
  }

  /**
   * Retrive a value from the cache by key.
   *
   * @param   {string}  key   The key of the record to set
   * @param   {any}     value The value to set
   * @returns {void}
   */
  set(key, value) {
    try {
      this._db.prepare(SET_QUERY).run({
        key,
        value: SafeJSON.stringify(value)
      });
    } catch (err) {
      return;
    }
  }
}

// Export appropriate cache class.
module.exports = Database ? SqliteCache : NoopCache;

// Attach classes for testing.
module.exports._classes = {
  SqliteCache,
  NoopCache
};
