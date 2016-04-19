"use strict";

var path = require("path");
var util = require("util");
var _ = require("lodash/fp");

var Base = require("./base");

var getModuleName = function getModuleName (filePathString) {
  var fileStringArray = filePathString.split("/");

  var fileString = fileStringArray[0];

  // Handle private module case
  if (fileStringArray[0].indexOf("@") === 0) {
    fileString += "/" + fileStringArray[1];
  }

  return fileString;
};

var addToDirStructure = function addToDirStructure (currentDir, pathArray, packageJSON) {
  // get the first module from pathArray and mutate pathArray to remaining items
  var firstModule = getModuleName(pathArray.shift());

  if (!currentDir[firstModule]) {
    currentDir[firstModule] = {};
  }

  // Not at end of path yet so keep adding to directory structure
  if (pathArray.length > 0) {
    addToDirStructure(currentDir[firstModule], pathArray, packageJSON);

    return;
  }

  // End of path so put packageJSON here
  currentDir[firstModule].__packageJSON = packageJSON;
};

var getModulePath = function (depName, currentPathArray, dirStructure) {
  var attemptedPathArray = currentPathArray.concat([depName]);
  var moduleDir = _.get(attemptedPathArray.join("."))(dirStructure);

  if (moduleDir) {
    return attemptedPathArray;
  }

  if (currentPathArray.length === 0) {
    return null;
  }

  // If not found locally, check the parent dir until we hit root.
  return getModulePath(depName, currentPathArray.slice(0, -1), dirStructure);
};

var getSkewedDepsWithGraphInfo = function getSkewedDepsWithGraphInfo (rootDirStructure, allPackagesInBundle, knownSkewedPackages) {
  var packageMap = {};
  var checkedModules = {};
  var notFoundPackages = {};
  var skewedPackageMap = {};

  var addDepToPackageMap = function addDepToPackageMap (modulePath, requiredByString) {
    var packageJSON = _.get(modulePath.join(".") + ".__packageJSON")(rootDirStructure);
    var packageName = packageJSON.name;
    var packageVersion = packageJSON.version;
    var packageString = packageName + "@" + packageVersion;

    // If we've already checked this package.json, return;
    if (checkedModules[packageString]) {
      return;
    }

    checkedModules[packageString] = true;


    if (!packageMap[packageName]) {
      packageMap[packageName] = {};
    }

    if (!packageMap[packageName][packageVersion]) {
      packageMap[packageName][packageVersion] = [requiredByString];
    } else {
      packageMap[packageName][packageVersion].push(requiredByString);
    }

    packageMap[packageName][packageVersion] = packageMap[packageName][packageVersion].sort();

    requiredByString += " -> " + packageString;

    if (packageJSON.dependencies) {
      _.each(function (depVersion, depName) {
        // Ignore any packages that aren't bundled
        if (!allPackagesInBundle[depName]) {
          return;
        }

        var pathToModuleArray = getModulePath(depName, modulePath, rootDirStructure);

        if (!pathToModuleArray) {
          // Add our requiredByString to the notFoundPackages since we don't know what version
          // This tree branch resolved to.
          if (notFoundPackages[depName]) {
            notFoundPackages[depName].push(requiredByString);

            return;
          }

          notFoundPackages[depName] = [requiredByString];

          return;
        }

        return addDepToPackageMap(pathToModuleArray, requiredByString);

      })(packageJSON.dependencies);
    }
  };

  addDepToPackageMap([], "Root");

  var skewedPackageMap = _.pickBy(function (versionObj) {
    return Object.keys(versionObj).length > 1;
  })(packageMap);

  // Add lost puppies back to skewedPackageMap
  _.each(function (consumerList, depName) {
    if (skewedPackageMap[depName]) {

      skewedPackageMap[depName].unknown_resolved_version = consumerList;
    }
  })(notFoundPackages);

  return skewedPackageMap;
};

var mapToSortedSkewedArray = function mapToSortedSkewedArray (skewedDepMap, allPackages) {
  return _.sortBy(function (obj) {
    return obj.skewedDeps.length;
  })(Object.keys(skewedDepMap).map(function (depName) {
    var subDepsWithSkew = [];

    Object.keys(skewedDepMap[depName]).forEach(function (version) {
      var deps = allPackages[depName][version] && allPackages[depName][version].dependencies;

      if (deps) {
        subDepsWithSkew = _.uniq(
          subDepsWithSkew.concat(
            _.intersection(Object.keys(deps))(Object.keys(skewedDepMap))
          )
        ).sort();
      }
    });

    return {
      name: depName,
      skewedDeps: subDepsWithSkew,
      versions: skewedDepMap[depName]
    }
  }));
};

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

  var rootPackageJSONPath;
  var rootPackageJSON;
  var allPackagesInBundle = {};
  var dirStructure = {};

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

      var fileString = getModuleName(packagePathArray[packagePathArray.length -1]);

      if (!rootPackageJSONPath) {
        // In packagePathArray, whatever comes before the first ~/ is the root level
        rootPackageJSONPath = path.join(pathRoot, packagePathArray[0]);
      }

      packagePathArray[packagePathArray.length -1] = fileString;

      // We either know where it came from or it was flattened to top level node_modules.
      var currentPathNormalized = packagePathArray.length > 2 ?
        packagePathArray.slice(1, packagePathArray.length - 1).join(" -> ") :
        "Root";

      var packagePath = path.join(pathRoot, packagePathArray.join("node_modules/"), "package.json");

      try {
        packageJSON = require(packagePath);
      } catch (err) {

        return packageMap;
      }

      // Add package.json to allFileInBundle
      if (!allPackagesInBundle[packageJSON.name]) {
        allPackagesInBundle[packageJSON.name] = {};
      }

      allPackagesInBundle[packageJSON.name][packageJSON.version] = packageJSON;

      // Pass in the pathArray starting with the first module, ignore first `./` or `../`
      addToDirStructure(
        dirStructure,
        packagePathArray.slice(1, packagePathArray.length),
        packageJSON
      );

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

  // If we have a rootPackageJSON, we can find dependency chains for all skewed deps.
  // If not, return the current packages
  try {
    rootPackageJSON = require(rootPackageJSONPath + "package.json");
  } catch (err) {
    callback(null, mapToSortedSkewedArray(allPackagesWithSkew, allPackagesInBundle));

    return;
  }

  // In some cases webpack dedupes to a nested module
  // This means the root level module does not appear in the bundle despite having consumers.
  // We check for all packages that are in the bundle but not at root level.
  // If there is only one version of that package in the bundle we can safely add it to root
  // Because we know it matches the version that exists at root in the file system
  var dedupedToNested = _.difference(Object.keys(allPackagesInBundle))(Object.keys(dirStructure));

  dedupedToNested.forEach(function (depName) {
    var versions = Object.keys(allPackagesInBundle[depName]);

    if (versions.length === 1) {
      dirStructure[depName] = {};
      dirStructure[depName].__packageJSON = allPackagesInBundle[depName][versions[0]];
    }

    // We can ignore the else case here because if multiple versions exist at nested levels,
    // they are guaranteed to be caught by getSkewedDepsWithGraphInfo.
    // Dep graph branches that can't find this package will be added to unknown_resolved_version.
  });

  dirStructure.__packageJSON = rootPackageJSON;

  var skewedDepsWithGraphInfo = getSkewedDepsWithGraphInfo(dirStructure, allPackagesInBundle, allPackagesWithSkew);

  var sortedSkewedDepArray = mapToSortedSkewedArray(skewedDepsWithGraphInfo, allPackagesInBundle);

  callback(null, sortedSkewedDepArray);
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
