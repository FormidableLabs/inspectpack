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
  serialize() { return { cls: NoopCache.name }; }
  get() { return null; }
  set() {}
}

class SqliteCache {
  /**
   * Create a new cache from disk.
   *
   * @param   {Object}   opts           Object options
   * @param   {String}   opts.filename  The filename of the SQLite database
   * @returns {Cache}                   The hydrated cache or noop cache on error
   */
  static create(opts) {
    try {
      return new SqliteCache(opts);
    } catch (err) {
      return new NoopCache();
    }
  }

  /**
   * A cache that can serialize to, and deserialize from, disk.
   *
   * @param {Object}   opts           Object options
   * @param {String}   opts.filename  The filename of the SQLite databases
   */
  constructor(opts) {
    this._filename = (opts || {}).filename || DEFAULT_DATABASE;
    this._db = new Database(this._filename);
    // WAL mode ensures safe multiprocess access
    this._db.pragma("journal_mode = WAL");
    this._db.prepare(CREATE_TABLE_QUERY).run();
  }

  serialize() {
    return {
      cls: SqliteCache.name,
      filename: this._filename
    };
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
    } catch (err) { /* passthrough */ }
  }
}

// Export appropriate cache class.
module.exports = Database ? SqliteCache : NoopCache;

// Attach classes for testing.
Object.assign(module.exports, {
  SqliteCache,
  NoopCache
});
