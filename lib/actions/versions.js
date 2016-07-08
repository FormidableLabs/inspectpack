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

var getModuleName = function (libPath) {
  // eslint-disable-next-line no-magic-numbers
  return _.take(libPath[0] === "@" ? 2 : 1)(libPath.split("/")).join("/");
};

var getPackageJSON = function (packagePath) {
  try {
    return require(packagePath); // eslint-disable-line global-require
  } catch (err) {
    return null;
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
  var moduleDir = _.get(attemptedPathArray)(dirStructure);

  if (moduleDir) {
    return attemptedPathArray;
  }

  if (currentPathArray.length === 0) {
    return null;
  }

  // If not found locally, check the parent dir until we hit root.
  return getModulePath(depName, currentPathArray.slice(0, -1), dirStructure);
};

var addRequirePathToPackageMap = function (pkg, requirePath, pkgMap) {
  pkgMap[pkg.name] = pkgMap[pkg.name] || {};

  // Ensure array, add path, and filter to sorted uniques.
  var updates = (pkgMap[pkg.name][pkg.version] || []).concat([requirePath]);
  pkgMap[pkg.name][pkg.version] = _.flow(
    _.uniq,
    _.sortBy(_.identity)
  )(updates);

  return pkgMap;
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
    var packageJSON = _.get(modulePath.concat(["__packageJSON"]))(rootDirStructure);
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
      var checkFn = createCheckDepFunction(requiredByString, modulePath);
      _.each.convert({ cap: false })(checkFn)(packageJSON.dependencies);
    }
  };

  addDepToPackageMap([], "");

  skewedPackageMap = getSkewedPackageMap(packageMap);

  // Add lost puppies back to skewedPackageMap
  _.each.convert({ cap: false })(function (consumerList, depName) {
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
  "* Bundle:",
  "    * Path:                <%= opts.bundle %>",
  "    * Num Libs:            <%= data.versions.length %>",
  "",
  "## Libraries               <% _.each(function (obj) { %>",
  "* <%= obj.name %>",
  "  * Skewed Deps: <%= obj.skewedDeps.length %><% _.each(function (skewed) { %>",
  "    * <%= skewed %>" +
  "<% })(obj.skewedDeps); %>",
  "",
  "  * Versions: <%= Object.keys(obj.versions).length %>" +
  "<% _.each.convert({ cap: false })(function (versionsGroup, key) { %>",
  "    * <%= key %>: <% _.each(function (versionItem) { %>",
  "      * <%= versionItem %>" +
  "<% })(versionsGroup); %>" +
  "<% })(obj.versions); %>",
  "<% })(data.versions); %>"
].join("\n"));

Versions.prototype.tsvTemplate = _.template([
  "Name\tNum. Skewed\tSkewed Deps\tVersions\n",
  "<% _.each(function (obj) { %>",
  "<%= obj.name %>\t",
  "<%= obj.skewedDeps.length %>\t",
  "<%= _.sortBy(_.identity)(obj.skewedDeps).join(', ') %>\t",
  "<%= _.sortBy(_.identity)(Object.keys(obj.versions)).join(', ') %>\n",
  "<% })(data.versions); %>"
].join(""));

/*eslint-disable max-statements*/
Versions.prototype.getData = function (callback) {
  var pathRoot = path.resolve(this.opts.root);
  var codes = this.bundle.codes;

  var allPackagesInBundle = {};
  var dirStructure = {};

  // In the split path array, whatever comes before the first ~/ is the bundle location from root.
  var bundleLocationFromRoot = _.find(isCodeANodeModule)(codes).fileName.split("~/")[0];
  var rootPackageJSONPath = path.join(pathRoot, bundleLocationFromRoot, "package.json");
  var rootPackageJSON = getPackageJSON(rootPackageJSONPath);

  // Mutate outside variables.
  // eslint-disable-next-line lodash-fp/no-unused-result
  _.flow(
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
    }, {})
  )(codes);

  // If we have a rootPackageJSON, we can find dependency chains for all skewed deps.
  // If not, throw.
  if (!rootPackageJSON) {
    callback(new Error("Unable to find project root package.json"));
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

  // Finish data processing.
  var data = getSortedSkewedDepArray(dirStructure, allPackagesInBundle);

  // Filter to missed deduplication opportunities.
  if (this.opts.duplicates) {
    // Lazy require to avoid potential future circular dependencies.
    var Duplicates = require("./duplicates").Duplicates; // eslint-disable-line global-require
    var dups = new Duplicates({
      opts: {}, // Use default options here.
      bundle: this.bundle
    });

    dups.getData(function (err, dupsData) {
      if (err) {
        callback(err);
        return;
      }

      // Collapse the duplicate files to just the module names.
      var dupLibs = _.flow(
        _.keys,
        _.reject(function (k) { return k === "meta"; }),
        _.map(getModuleName),
        _.uniq
      )(dupsData);

      // Filter data to duplicate libraries only.
      callback(null, {
        versions: _.filter(function (o) { return _.contains(o.name)(dupLibs); })(data)
      });
    });

    return;
  }

  // Unfiltered data.
  callback(null, {
    versions: data
  });
};
/*eslint-enable max-statements*/

/**
 * Return list of version skews in packages from file bundle.
 *
 * @param {Object}    opts                  Options
 * @param {String}    opts.bundle           Bundle file path
 * @param {Array}     opts.root             Root path to project
 * @param {String}    opts.format           Output format type
 * @param {Boolean}   opts.duplicates       Filter to missed deduplication opportunities.
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Versions);
