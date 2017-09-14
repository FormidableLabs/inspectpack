"use strict";

const _ = require("lodash/fp");
const Database = require("better-sqlite3");

const SafeJSON = require("./safe-json");

const DEFAULT_DATABASE = ".inspectpack-cache.db";

const CREATE_TABLE_QUERY =
  "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT);";
const GET_QUERY = "SELECT value FROM cache WHERE key IS $key;";
const SET_QUERY = "INSERT OR REPLACE INTO cache (key, value) VALUES ($key, $value);";

module.exports = class Cache {
  /**
   * Asynchronously create a new cache from disk.
   *
   * @param   {Object}   opts           Object options
   * @param   {String}   opts.filename  The filename of the SQLite database
   * @param   {String}   opts.name      A name for this instance used in debugging
   * @returns {Cache}                   The hydrated cache
   */
  static create(opts) {
    opts = opts || {};

    try {
      const db = new Database(opts.filename || DEFAULT_DATABASE);
      // WAL mode ensures safe multiprocess access
      db.pragma("journal_mode = WAL");
      db.prepare(CREATE_TABLE_QUERY).run();
      return new Cache(opts, db);
    } catch (err) {
      return null;
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
};
