"use strict";

var _ = require("lodash/fp");

var Bundle = require("../models/bundle");

var JSON_SPACES = 2;

/**
 * Base abstraction for actions.
 *
 * @param {Object} opts         Object options
 * @param {Object} opts.opts    Options from commandline
 * @param {Object} opts.bundle  Bundle object
 * @returns {void}
 */
var Base = module.exports = function Base(opts) {
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
  var opts = this.opts;
  var format = opts.format;

  if (format === "json") {
    return JSON.stringify(data, null, JSON_SPACES);
  } else if (format === "text") {
    return this.textTemplate({
      opts: opts,
      data: _.omit("meta")(data),
      meta: data.meta
    });
  }

  // Programming error.
  throw new Error("Unknown format: " + format);
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
  var Cls = this; // eslint-disable-line consistent-this
  if (!Cls instanceof Base) {
    throw new Error("Must bind an actions/base instance");
  }

  Bundle.create(opts, function (bundleErr, bundle) {
    if (bundleErr) {
      callback(bundleErr);
      return;
    }

    // Create action instance and get data for report.
    var instance = new Cls({
      opts: opts,
      bundle: bundle
    });

    try {
      instance.getData(function (err, data) {
        // Format data and return.
        var output = !err ? instance.display(data) : null;
        callback(err, output);
      });
    } catch (err) {
      callback(err);
      return;
    }
  });
};
