"use strict";
/*eslint-disable lodash-fp/prefer-constant*/

const tap = require("lodash/fp").tap;

let Database;
try {
  Database = require("better-sqlite3"); // eslint-disable-line global-require
} catch (err) { /* passthrough */ }

const hash = require("./hash");
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
  wrapAction(opts) { return opts.action; }
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
      return SafeJSON.parse((record || {}).value);
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

  /**
   * Retrieve a value from the cache by key.
   *
   * @param   {Object}   opts           Options object.
   * @param   {Function} opts.action    Raw function to invoke (returns promise).
   * @param   {Function} opts.hashArgs  Optional hash argument function.
   * @returns {Function}                Wrapped action with cache get/set.
   */
  wrapAction(opts) {
    return (args) => {
      const hashedKey = hash(opts.hashArgs ? opts.hashArgs(args) : args);

      const cachedValue = this.get(hashedKey);
      if (cachedValue) {
        return Promise.resolve(cachedValue);
      }

      return opts.action(args)
        .then(tap((value) =>
          this.set(hashedKey, value))
        );
    };
  }
}

// Export appropriate cache class.
module.exports = Database ? SqliteCache : NoopCache;

// Attach classes for testing.
Object.assign(module.exports, {
  SqliteCache,
  NoopCache
});
