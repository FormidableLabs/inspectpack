"use strict";
/*eslint no-magic-numbers: ["error", { "ignore": [0, 1, -1] }]*/

var path = require("path");
var util = require("util");
var _ = require("lodash/fp");

var Base = require("./base");

var MIN_NESTED_PATH_LENGTH = 2; // Ignore `./~` or `../~` since those are pointing to root modules

var isCodeANodeModule = function (code) {
  return code.fileName.indexOf("~/") !== -1;
};

var getSkewedPackageMap = function (packageMap) {
  return _.pickBy(function (versionObj) {
    return Object.keys(versionObj).length > 1;
  })(packageMap);
};

var getModuleName = function (filePathString) {
  var fileStringArray = filePathString.split("/");

  var fileString = fileStringArray[0];

  // Handle private module case
  if (fileStringArray[0].indexOf("@") === 0) {
    fileString += "/" + fileStringArray[1];
  }

  return fileString;
};

var getPackageJSON = function (packagePath) {
  var packageJSON = null;

  try {
    packageJSON = require(packagePath); // eslint-disable-line global-require

    return packageJSON;
  } catch (err) {
    return packageJSON;
  }
};

var addToDirStructure = function (currentDir, pathArray, packageJSON) {
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

var addRequirePathToPackageMap = function (packageJSON, requirePath, packageMap) {
  if (!packageMap[packageJSON.name]) {
    packageMap[packageJSON.name] = {};
  }

  if (!packageMap[packageJSON.name][packageJSON.version]) {
    packageMap[packageJSON.name][packageJSON.version] = [requirePath];
  } else {
    packageMap[packageJSON.name][packageJSON.version].push(requirePath);
  }

  packageMap[packageJSON.name][packageJSON.version] = _.uniq(
    packageMap[packageJSON.name][packageJSON.version]
  ).sort();

  return packageMap;
};

var getSkewedDepsWithGraphInfo = function (rootDirStructure, allPackagesInBundle) {
  var packageMap = {};
  var checkedModules = {};
  var notFoundPackages = {};
  var skewedPackageMap = {};

  var createCheckDepFunction = function (requiredByString, modulePath) {
    return function (depVersion, depName) {
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

      addDepToPackageMap( // eslint-disable-line no-use-before-define
        pathToModuleArray,
        requiredByString
      );
    };
  };

  var addDepToPackageMap = function (modulePath, requiredByString) {
    var packageJSON = _.get(modulePath.join(".") + ".__packageJSON")(rootDirStructure);
    var packageName = packageJSON.name;
    var packageVersion = packageJSON.version;
    var packageString = packageName + "@" + packageVersion;

    packageMap = addRequirePathToPackageMap(
      packageJSON,
      requiredByString,
      packageMap
    );

    // If we've already checked this package.json, return;
    if (checkedModules[packageString]) {
      return;
    }

    checkedModules[packageString] = true;

    requiredByString += requiredByString ? " -> " + packageString : "root";

    if (packageJSON.dependencies) {
      _.each(createCheckDepFunction(requiredByString, modulePath))(packageJSON.dependencies);
    }
  };

  addDepToPackageMap([], "");

  skewedPackageMap = getSkewedPackageMap(packageMap);

  // Add lost puppies back to skewedPackageMap
  _.each(function (consumerList, depName) {
    if (skewedPackageMap[depName]) {

      skewedPackageMap[depName].unknownResolvedVersion = consumerList;
    }
  })(notFoundPackages);

  return skewedPackageMap;
};

var mapToSortedSkewedArray = function (skewedDepMap, allPackages) {
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
    };
  }));
};

var getSortedSkewedDepArray = function (dirStructure, allPackagesInBundle) {
  var skewedDepsWithGraphInfo = getSkewedDepsWithGraphInfo(
    dirStructure,
    allPackagesInBundle
  );

  return mapToSortedSkewedArray(skewedDepsWithGraphInfo, allPackagesInBundle);
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

  var allPackagesInBundle = {};
  var dirStructure = {};

  // In the split path array, whatever comes before the first ~/ is the bundle location from root.
  var bundleLocationFromRoot = _.find(isCodeANodeModule)(codes).fileName.split("~/")[0];
  var rootPackageJSONPath = path.join(pathRoot, bundleLocationFromRoot, "package.json");
  var rootPackageJSON = getPackageJSON(rootPackageJSONPath);

  // Create skewed packages object.
  var allPackagesWithSkew = _.flow(
    // Remove non node_module code pieces
    _.filter(isCodeANodeModule),

    // Reduce to a map of {<packageName>: {<versionNumber>: <PathInfo>}}
    _.reduce(function (packageMap, code) {
      var packagePathArray = code.fileName.split("~/");

      var fileString = getModuleName(packagePathArray[packagePathArray.length - 1]);

      packagePathArray[packagePathArray.length - 1] = fileString;

      // We either know where it came from or it was flattened to top level node_modules.
      var currentPathNormalized = packagePathArray.length > MIN_NESTED_PATH_LENGTH ?
        packagePathArray.slice(1, packagePathArray.length - 1).join(" -> ") :
        "Root";

      var packagePath = path.join(pathRoot, packagePathArray.join("node_modules/"), "package.json");

      var packageJSON = getPackageJSON(packagePath);

      if (!packageJSON) {
        return packageMap;
      }

      // Add package.json to allPackagesInBundle
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

      packageMap = addRequirePathToPackageMap(
        packageJSON,
        currentPathNormalized,
        packageMap
      );

      return packageMap;
    }, {}),

    // Only keep modules with more than one version
    getSkewedPackageMap
  )(codes);

  // If we have a rootPackageJSON, we can find dependency chains for all skewed deps.
  // If not, return the current packages
  if (!rootPackageJSON) {
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

  callback(null, getSortedSkewedDepArray(dirStructure, allPackagesInBundle));
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
