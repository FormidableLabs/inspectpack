"use strict";
/*eslint no-magic-numbers: ["error", { "ignore": [0, 1, -1] }]*/

const path = require("path");
const util = require("util");
const _ = require("lodash/fp");

const Base = require("./base");

const MIN_NESTED_PATH_LENGTH = 2; // Ignore `./~` or `../~` since those are pointing to root modules

const isCodeANodeModule = function (code) {
  return code.fileName.indexOf("~/") !== -1;
};

const getSkewedPackageMap = function (packageMap) {
  return _.pickBy((versionObj) => {
    return Object.keys(versionObj).length > 1;
  })(packageMap);
};

const getModuleName = function (libPath) {
  // eslint-disable-next-line no-magic-numbers
  return _.take(libPath[0] === "@" ? 2 : 1)(libPath.split("/")).join("/");
};

const getPackageJSON = function (packagePath) {
  try {
    return require(packagePath); // eslint-disable-line global-require
  } catch (err) {
    return null;
  }
};

const addToDirStructure = function (currentDir, pathArray, packageJSON) {
  // get the first module from pathArray and mutate pathArray to remaining items
  const firstModule = getModuleName(pathArray.shift());

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

const getModulePath = function (depName, currentPathArray, dirStructure) {
  const attemptedPathArray = currentPathArray.concat([depName]);
  const moduleDir = _.get(attemptedPathArray)(dirStructure);

  if (moduleDir) {
    return attemptedPathArray;
  }

  if (currentPathArray.length === 0) {
    return null;
  }

  // If not found locally, check the parent dir until we hit root.
  return getModulePath(depName, currentPathArray.slice(0, -1), dirStructure);
};

const addRequirePathToPackageMap = function (pkg, requirePath, pkgMap) {
  pkgMap[pkg.name] = pkgMap[pkg.name] || {};

  // Ensure array, add path, and filter to sorted uniques.
  const updates = (pkgMap[pkg.name][pkg.version] || []).concat([requirePath]);
  pkgMap[pkg.name][pkg.version] = _.flow(
    _.uniq,
    _.sortBy(_.identity)
  )(updates);

  return pkgMap;
};

const getSkewedDepsWithGraphInfo = function (rootDirStructure, allPackagesInBundle) {
  let packageMap = {};
  const checkedModules = {};
  const notFoundPackages = {};
  let skewedPackageMap = {};

  const createCheckDepFunction = function (requiredByString, modulePath) {
    return function (depVersion, depName) {
      // Ignore any packages that aren't bundled
      if (!allPackagesInBundle[depName]) {
        return;
      }

      const pathToModuleArray = getModulePath(depName, modulePath, rootDirStructure);

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

  const addDepToPackageMap = function (modulePath, requiredByString) {
    const packageJSON = _.get(modulePath.concat(["__packageJSON"]))(rootDirStructure);
    const packageName = packageJSON.name;
    const packageVersion = packageJSON.version;
    const packageString = `${packageName }@${ packageVersion}`;

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

    requiredByString += requiredByString ? ` -> ${ packageString}` : "root";

    if (packageJSON.dependencies) {
      const checkFn = createCheckDepFunction(requiredByString, modulePath);
      _.each.convert({ cap: false })(checkFn)(packageJSON.dependencies);
    }
  };

  addDepToPackageMap([], "");

  skewedPackageMap = getSkewedPackageMap(packageMap);

  // Add lost puppies back to skewedPackageMap
  _.each.convert({ cap: false })((consumerList, depName) => {
    if (skewedPackageMap[depName]) {
      skewedPackageMap[depName].unknownResolvedVersion = consumerList;
    }
  })(notFoundPackages);

  return skewedPackageMap;
};

const mapToSortedSkewedArray = function (skewedDepMap, allPackages) {
  return _.sortBy((obj) => {
    return obj.skewedDeps.length;
  })(Object.keys(skewedDepMap).map((depName) => {
    let subDepsWithSkew = [];

    Object.keys(skewedDepMap[depName]).forEach((version) => {
      const deps = allPackages[depName][version] && allPackages[depName][version].dependencies;

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

const getSortedSkewedDepArray = function (dirStructure, allPackagesInBundle) {
  const skewedDepsWithGraphInfo = getSkewedDepsWithGraphInfo(
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
const Versions = function Versions() {
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
  const pathRoot = path.resolve(this.opts.root);
  const codes = this.bundle.codes;

  const allPackagesInBundle = {};
  const dirStructure = {};

  const rootPackageJSONPath = path.resolve(pathRoot, this.path || "", "package.json");
  const rootPackageJSON = getPackageJSON(rootPackageJSONPath);

  // Mutate outside variables.
  // eslint-disable-next-line lodash-fp/no-unused-result
  _.flow(
    // Remove non node_module code pieces
    _.filter(isCodeANodeModule),

    // Reduce to a map of {<packageName>: {<versionNumber>: <PathInfo>}}
    _.reduce((packageMap, code) => {
      const packagePathArray = code.fileName.split("~/");

      const fileString = getModuleName(packagePathArray[packagePathArray.length - 1]);

      packagePathArray[packagePathArray.length - 1] = fileString;

      // We either know where it came from or it was flattened to top level node_modules.
      const currentPathNormalized = packagePathArray.length > MIN_NESTED_PATH_LENGTH ?
        packagePathArray.slice(1, packagePathArray.length - 1).join(" -> ") :
        "Root";

      const packagePath = path.join(
        pathRoot,
        packagePathArray.join("node_modules/"
      ), "package.json");

      const packageJSON = getPackageJSON(packagePath);

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
  const dedupedToNested = _.difference(Object.keys(allPackagesInBundle))(Object.keys(dirStructure));

  dedupedToNested.forEach((depName) => {
    const versions = Object.keys(allPackagesInBundle[depName]);

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
  const data = getSortedSkewedDepArray(dirStructure, allPackagesInBundle);

  // Filter to missed deduplication opportunities.
  if (this.opts.duplicates) {
    // Lazy require to avoid potential future circular dependencies.
    const Duplicates = require("./duplicates").Duplicates; // eslint-disable-line global-require
    const dups = new Duplicates({
      opts: {}, // Use default options here.
      bundle: this.bundle
    });

    dups.getData((err, dupsData) => {
      if (err) {
        callback(err);
        return;
      }

      // Collapse the duplicate files to just the module names.
      const dupLibs = _.flow(
        _.keys,
        _.reject((k) => { return k === "meta"; }),
        _.map(getModuleName),
        _.uniq
      )(dupsData);

      // Filter data to duplicate libraries only.
      callback(null, {
        versions: _.filter((o) => { return _.contains(o.name)(dupLibs); })(data)
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
 * @param {String}    opts.code             Raw bundle string
 * @param {Array}     opts.root             Root path to project
 * @param {String}    opts.format           Output format type
 * @param {Boolean}   opts.duplicates       Filter to missed deduplication opportunities.
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Versions);
