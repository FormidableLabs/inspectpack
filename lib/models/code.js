"use strict";

const _ = require("lodash/fp");
const moduleTypes = require("./module-types");

/**
 * Webpack code section abstraction
 *
 * @param {Object}           opts           Options
 * @param {String}           opts.id        Module ID in Webpack bundle
 * @param {String}           opts.fileName  The module's file name
 * @param {String}           opts.type      The type of module. See ./module-types.js
 * @param {String}           opts.code      Raw JavaScript code
 * @param {Number}           opts.singleRef The numeric single ref of the module
 * @param {Array<Number>}    opts.multiRefs The array of numeric refs of the module
 * @returns {void}
 */
const Code = function Code(opts) {
  this.id = opts.id;
  this.fileName = opts.fileName;
  this.type = opts.type;

  this.code = opts.code;
  this.singleRef = opts.singleRef;
  this.multiRefs = opts.multiRefs;

  if (this.fileName) {
    this.baseName = this._getBaseName(this.fileName);
  }
  this.isTemplate = this.fileName
    ? this._isTemplate(this.fileName)
    : false;
};

Code.prototype.isCode = function () {
  return this.type === moduleTypes.CODE;
};

Code.prototype.isNothingRef = function () {
  return this.type === moduleTypes.NOTHING_REF;
};

Code.prototype.isSingleRef = function () {
  return this.type === moduleTypes.SINGLE_REF;
};

Code.prototype.isMultiRef = function () {
  return this.type === moduleTypes.MULTI_REF;
};

Code.prototype.isEmpty = function () {
  return this.type === moduleTypes.EMPTY;
};

Code.prototype.isUnknown = function () {
  return this.type === moduleTypes.UNKNOWN;
};

Code.prototype._getBaseName = function (fileName) {
  return _.last(fileName.split("~")).replace(/^\//, "");
};

Code.prototype._isTemplate = function (fileName) {
  // eslint-disable-next-line no-magic-numbers
  return fileName.indexOf("template of ") === 0;
};

module.exports = Code;
