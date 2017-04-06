"use strict";

const _ = require("lodash/fp");

const Bundle = require("../models/bundle");

const JSON_SPACES = 2;

/**
 * Base abstraction for actions.
 *
 * @param {Object} opts         Object options
 * @param {Object} opts.opts    Options from commandline
 * @param {Object} opts.bundle  Bundle object
 * @returns {void}
 */
const Base = module.exports = function Base(opts) {
  this.opts = opts.opts;
  this.bundle = opts.bundle;
};

// Action name.
Base.prototype.name = null;

// Empty template.
Base.prototype.textTemplate = null;

Base.prototype.getData = function (/*callback*/) {
  throw new Error("Must implement");
};

/**
 * Format for display.
 *
 * @param   {Object}  data  Data object
 * @returns {String}        Formatted string
 */
Base.prototype.display = function (data) {
  const opts = this.opts;
  const format = opts.format;

  switch (format) {
  case "object":
    return data;
  case "json":
    return JSON.stringify(data, null, JSON_SPACES);
  case "text":
    return this.textTemplate({
      opts,
      data: _.omit("meta")(data),
      meta: data.meta
    });
  case "tsv":
    if (typeof this.tsvTemplate === "undefined") {
      throw new Error("TSV output not implemented");
    }

    return this.tsvTemplate({
      opts,
      data: _.omit("meta")(data),
      meta: data.meta
    });
  default:
    // Programming error.
    throw new Error(`Unknown format: ${format}`);
  }
};

/**
 * Create Action with a code bundle.
 *
 * Usage: bind with desired subclass. `MyClass.create = Base.createWithBundle.bind(MyClass)`
 *
 * @param {Object}    opts          Options
 * @param {Function}  callback      Form `(err, data)`
 * @returns {void}
 */
Base.createWithBundle = function (opts, callback) {
  const Cls = this; // eslint-disable-line consistent-this
  if (!Cls instanceof Base) {
    throw new Error("Must bind an actions/base instance");
  }

  Bundle.create(opts, (bundleErr, bundle) => {
    if (bundleErr) {
      callback(bundleErr);
      return;
    }

    // Create action instance and get data for report.
    const instance = new Cls({
      opts,
      bundle
    });

    try {
      instance.getData((err, data) => {
        // Format data and return.
        const output = !err ? instance.display(data) : null;
        callback(err, output);
      });
    } catch (err) {
      callback(err);
      return;
    }
  });
};
