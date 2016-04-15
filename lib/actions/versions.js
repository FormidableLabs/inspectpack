"use strict";

var fs = require("fs");
var path = require("path");
var util = require("util");
var _ = require("lodash/fp");

var Base = require("./base");

/**
 * Versions action abstraction.
 *
 * @returns {void}
 */
var Versions = function Versions() {
  Base.apply(this, arguments);
};

util.inherits(Versions, Base);

Versions.prototype.name = "versions";

Versions.prototype.textTemplate = _.template([
  "inspectpack --action=versions",
  "=============================",
  "",
  "## Summary",
  "",
  "TODO",
  ""
].join("\n"));

Versions.prototype.getData = function (callback) {
  var pathRoot = this.opts.root;
  var codes = this.bundle.codes;

  // Create skewed packages object.
  var allPackagesWithSkew = _.flow(
    // Remove non node_module code pieces
    _.filter(function (code) {
      return code.fileName.indexOf("~/") !== -1;
    }),

    // Reduce to a map of {<packageName>: {<versionNumber>: <PathInfo>}}
    _.reduce(function(packageMap, code) {
      var packageJSON;
      var packagePathArray = code.fileName.split("~/");

      var fileStringArray = packagePathArray[packagePathArray.length -1].split("/");

      var fileString = fileStringArray[0];

      // Handle private module case
      if (fileStringArray[0].indexOf("@") === 0) {
        fileString += "/" + fileStringArray[1];
      }

      packagePathArray[packagePathArray.length -1] = fileString;

      // We either know where it came from or it was flattened to top level node_modules.
      var currentPathNormalized = packagePathArray.length > 2 ?
        packagePathArray.slice(1, packagePathArray.length - 1).join(" -> ") :
        "Root node_modules/";

      var packagePath = path.join(pathRoot, packagePathArray.join("node_modules/"), "package.json");

      try {
        packageJSON = require(packagePath);
      } catch (err) {
        console.log("no package.json found at ", packagePath, err);

        return packageMap;
      }

      // No package at this name stored yet
      if (!packageMap[packageJSON.name]) {
        packageMap[packageJSON.name] = {};
      }

      // No version stored for this package yet, add version with current path
      if (!packageMap[packageJSON.name][packageJSON.version]) {
        packageMap[packageJSON.name][packageJSON.version] = [currentPathNormalized];

        return packageMap;
      }

      // Version already exists, add currentPathNormalized to array and dedupe path array.
      packageMap[packageJSON.name][packageJSON.version].push(currentPathNormalized);
      packageMap[packageJSON.name][packageJSON.version] = _.uniq(
        packageMap[packageJSON.name][packageJSON.version]
      );

      return packageMap;
    }, {}),

    // Only keep modules with more than one version
    _.pickBy(function (versionObj) {
      return Object.keys(versionObj).length > 1;
    })
  )(codes);

  callback(null, allPackagesWithSkew);
};

/**
 * Return list of version skews in packages from file bundle.
 *
 * @param {Object}    opts                  Options
 * @param {String}    opts.bundle           Bundle file path
 * @param {Array}     opts.root             Root path to project
 * @param {String}    opts.format           Output format type
 * @param {Boolean}   opts.verbose          Verbose output?
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Versions);

// TODO: Filter down to missed deduplication opportunities (???)
