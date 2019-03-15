import { dirname, join } from "path";
import { readDir, readJson, toPosixPath } from "./files";

export interface INpmPackageBase {
  name: string;
  range: string; // the range from upstream (default to `version` if unset)
  version: string;
}

interface INpmPackage extends INpmPackageBase {
  dependencies: {
    [key: string]: string,
  };
  devDependencies: {
    [key: string]: string,
  };
}

interface INpmPackageMapPromise {
  [pkgPath: string]: Promise<INpmPackage | null>;
}

interface INpmPackageMap {
  [pkgPath: string]: INpmPackage | null;
}

export interface IDependencies extends INpmPackageBase {
  // The tree
  dependencies: IDependencies[];
  // Real path to installed package
  filePath: string;
}

// **Testing**: Stubbable accessor for readJson.
export const _files = { readJson };

/**
 * Read a `package.json`.
 *
 * These calls are memoized into a cache if provided as this is the only real
 * I/O involved.
 *
 * @param   {String}                  path  full path to `package.json`
 * @param   {INpmPackageMapPromise?}  cache cache object
 * @returns {Promise<INpmPackage | null>} object w/ package.json info
 */
export const readPackage = (
  path: string,
  cache?: INpmPackageMapPromise,
): Promise<INpmPackage | null> => {
  const _cache = cache || {};

  // Return from cache if exists.
  if (typeof _cache[path] !== "undefined") {
    return _cache[path];
  }

  // Otherwise, cache promise.
  _cache[path] = Promise.resolve()
    .then(() => _files.readJson(path))
    .catch((err) => {
      // Tolerate non-existent package.json.
      if (err.code === "ENOENT") { return null; }

      // Mutate in a more helpful error.
      if (err instanceof SyntaxError && (err.message || "").indexOf("Unexpected token") > -1) {
        err.message = `JSON parsing error for ${path} - ${err.message}`;
      }

      // Real file error.
      throw err;
    });

  return _cache[path];
};

// Helpers
const _isScoped = (n: string) => n.startsWith("@");
const _isIncludedPkg = (pkgsFilter?: string[]) => (name: string) => {
  // Package names are posix paths.
  return !pkgsFilter || pkgsFilter.indexOf(toPosixPath(name)) > -1;
};

/**
 * Recursively traverse a directory and inflate `package.json` information.
 *
 * These calls are memoized into a cache.
 *
 * @param   {String}                  path        starting path
 * @param   {String[]?}               pkgsFilter  limit to only these package names
 * @param   {INpmPackageMapPromise?}  cache       package map
 * @returns {Promise<INpmPackageMapPromise>} map of paths to package info
 */
export const readPackages = (
  path: string,
  pkgsFilter?: string[],
  cache?: INpmPackageMapPromise,
): Promise<INpmPackageMapPromise> => {
  const _cache = cache || {};
  const isIncludedPkg = _isIncludedPkg(pkgsFilter);

  return Promise.resolve()
    // Read root package.
    .then(() => readPackage(join(path, "package.json"), _cache))
    // Read next level of directories.
    .then(() => readDir(join(path, "node_modules")))
    // Add extra directories for scoped packages.
    .then((dirs) => Promise
      .all(dirs
        .filter(_isScoped)
        .map((scope: string) => readDir(join(path, "node_modules", scope))
          .then((scoped) => scoped.map((f: string) => join(scope, f))),
        ),
      )
      .then((extras) => extras.reduce((m, s) => m.concat(s), []))
      .then((extrasFlat) => dirs
        .filter((d) => !_isScoped(d))
        .concat(extrasFlat),
      ),
    )
    // Recurse into all next levels.
    .then((dirs) => Promise.all(
      dirs
        // Filter to known packages.
        .filter(isIncludedPkg)
        .map((dir) => {
          // console.log("TODO HERE NEXT LEVEL", JSON.stringify({
          //   path,
          //   dir,
          // }, null, 2))

          return dir;
        })
        // Recurse
        .map((dir) => readPackages(join(path, "node_modules", dir), pkgsFilter, _cache)),
    ))
    // The cache **is** our return value.
    .then(() => _cache);
};

// Resolve the entire package map.
export const _resolvePackageMap = (
  pkgMap: INpmPackageMapPromise,
): Promise<INpmPackageMap> => Promise
  // Resolve all paths to package objects.
  .all(Object.keys(pkgMap).map((path) => pkgMap[path]))
  // Add non-null package objects to final object.
  .then((pkgs) => Object.keys(pkgMap).reduce((obj, path, i) =>
    pkgs[i] === null ? obj : { ...obj, [path]: pkgs[i] },
    {},
  ));

export const _findPackage = ({
  filePath,
  name,
  pkgMap,
}: {
  filePath: string,
  name: string,
  pkgMap: INpmPackageMap,
}): {
  isFlattened: boolean,
  pkgPath: string | null;
  pkgObj: INpmPackage | null;
} => {
  // Incoming root.
  const resolvedRoot = filePath;

  // We now check the existing package map which, if iterating in correct
  // directory order, should already have higher up roots that may contain
  // `node_modules` **within** the `require` resolution rules that would
  // naturally be the "selected" module.
  //
  // Fixes https://github.com/FormidableLabs/inspectpack/issues/10
  // TODO(TEST): Add _multiple_ upper roots and make sure we choose the correct one.
  const cachedRoots = Object.keys(pkgMap)
    // Get directories.
    .map((k) => dirname(k))
    // Limit to those that are a higher up directory from our root, which
    // is fair game by Node.js `require` resolution rules, and not the current
    // root because that already failed.
    .filter((p) => p !== resolvedRoot && resolvedRoot.indexOf(p) === 0);

  const roots = [resolvedRoot].concat(cachedRoots);

  // Iterate down potential paths.
  // If we find it as _first_ result, then it hasn't been flattened.
  let isFlattened = false;

  for (const curRoot of roots) {
    // Reset to full path. This _will_ end up in some duplicate checks, but
    // shouldn't be too expensive.
    let curFilePath = filePath;

    while (curRoot.length <= curFilePath.length) {
      // Check at this level.
      const pkgPath = join(curFilePath, "node_modules", name);
      const pkgJsonPath = join(pkgPath, "package.json");
      const pkgObj = pkgMap[pkgJsonPath];

      // Found a match.
      if (pkgObj) {
        // Validation: These should all be **real** npm packages, so we should
        // **never** fail here. But, can't hurt to check.
        if (!pkgObj.name) {
          throw new Error(`Found package without name: ${JSON.stringify(pkgObj)}`);
        } else if (!pkgObj.version) {
          throw new Error(`Found package without version: ${JSON.stringify(pkgObj)}`);
        }

        return { isFlattened, pkgPath, pkgObj };
      }

      // Decrement path. If we find it now, it's flattened.
      curFilePath = dirname(curFilePath);
      isFlattened = true;
    }
  }

  return { isFlattened: false, pkgPath: null, pkgObj: null };
};

// - Populates `pkgMap` with installed `package.json`s
// - Creates a recursive `IDependencies[]` object that later needs to be
//   flattened and ranges fixed.
const _recurseDependencies = ({
  filePath,
  foundMap,
  names,
  pkgMap,
  pkgsFilter,
}: {
  filePath: string,
  foundMap?: { [filePath: string]: { [name: string]: IDependencies | null } },
  names: string[],
  pkgMap: INpmPackageMap,
  pkgsFilter?: string[],
}): IDependencies[] => {
  // Build up cache.
  const _foundMap = foundMap || {};

  const isIncludedPkg = _isIncludedPkg(pkgsFilter);

  return names
    .filter(isIncludedPkg)
    // Inflated current level.
    .map((name): { pkg: IDependencies, pkgNames: string[] } | null => {
      // Find actual location.
      const { isFlattened, pkgPath, pkgObj } = _findPackage({ filePath, name, pkgMap });

      // Short-circuit on not founds.
      if (pkgPath === null || pkgObj === null) {
        // TODO: Throw if not found?
        // console.log("TODO HERE MISS", { filePath, name, isFlattened, pkgPath, pkgObj });
        return null;
      }

      // Build and check cache.
      const found = _foundMap[pkgPath] = _foundMap[pkgPath] || {};
      if (found[name]) {
        return { pkg: found[name] as IDependencies, pkgNames: [] };
      }

      // Start building object.
      const pkg: IDependencies = {
        dependencies: [],
        filePath: pkgPath,
        name: pkgObj.name,
        range: pkgObj.version || "*", // Temporary value. Correct in post-processing.
        version: pkgObj.version,
      } as IDependencies;

      // Add reference to cache.
      if (!isFlattened) {
        found[name] = pkg;
      }

      // Get list of package names to recurse.
      // We **don't** traverse devDeps here because shouldn't have with
      // real, installed packages.
      const pkgNames = Object.keys(pkgObj.dependencies || {});
      return { pkg, pkgNames };
    })
    // Remove empties
    .filter(Boolean)
    // Lazy recurse after all caches have been filled for current level.
    .map((obj) => {
      // TS: Have to cast because boolean filter isn't inferred correctly.
      const { pkg, pkgNames } = obj as { pkg: IDependencies, pkgNames: string[] };

      // Only recurse when have dependencies.
      //
      // **Note**: This also serves as a way for found / cached dependency
      // hits to have this mutation step avoided since we manually return
      // `[]` on a cache hit.
      if (pkgNames.length) {
        pkg.dependencies = _recurseDependencies({
          filePath: pkg.filePath,
          foundMap: _foundMap,
          names: pkgNames,
          pkgMap,
          pkgsFilter,
        });
      }

      return pkg;
    }) as IDependencies[];
};

interface ICircularRefs {
  isCircular: boolean;
  refs: {
    [depsIdx: number]: ICircularRefs;
  };
}

const _identifyCircularRefs = (
  pkg: IDependencies,
  refPath?: IDependencies[],
): ICircularRefs => {
  const _refPath = refPath || [];

  // Detect circular and short-circuit.
  const circRef = _refPath.find((ref) => pkg === ref);
  if (circRef) {
    return {
      isCircular: true,
      refs: {},
    };
  }

  // Traverse further.
  const nextPath = _refPath.concat([pkg]);
  return {
    isCircular: false,
    refs: pkg.dependencies
      .map((dep) => _identifyCircularRefs(dep, nextPath))
      .reduce((memo, obj, i) => ({ ...memo, [i]: obj }), {}),
  };
};

const _getRef = (
  circRefs: ICircularRefs,
  refPath: number[],
): ICircularRefs => refPath.reduce((curRef, i) => {
  curRef = curRef.refs[i];
  if (!curRef) {
    throw new Error(`Could not find ref path: ${refPath}`);
  }

  return curRef;
}, circRefs);

// TS: null-allowing-intermediate function.
const _resolveRefsOrNull = (
  pkg: IDependencies,
  circRefs?: ICircularRefs,
  refPath?: number[],
): IDependencies | null => {
  // Get circular references map if not provided.
  const _circRefs = circRefs || _identifyCircularRefs(pkg);
  const _refPath = refPath || []; // LUT into circRefs object.
  const ref = _getRef(_circRefs, _refPath);

  // Short-circuit if flattened.
  if (ref.isCircular) { return null; }

  const resolvedPkg: IDependencies = {
    dependencies: pkg.dependencies
      .map((dep, i) => _resolveRefsOrNull(
        dep,
        _circRefs,
        _refPath.concat([i]),
      ))
      .filter(Boolean),
    filePath: pkg.filePath,
    name: pkg.name,
    range: pkg.range,
    version: pkg.version,
  } as IDependencies;

  return resolvedPkg;
};

// Create a new object with circular / flattened references resolved.
//
// TS: We create a casted wrapper function here which is safe because the
// _incoming_ `pkg` object is non-null, which means result is non-null.
const _resolveRefs = (
  pkg: IDependencies,
): IDependencies => _resolveRefsOrNull(pkg) as IDependencies;

// TS: null-allowing-intermediate function.
const _resolveRangesOrNull = (
  pkg: IDependencies,
  pkgMap: INpmPackageMap,
  lastFilePath?: string,
): IDependencies | null => {
  // Try a lookup pkgMap with lastFilePath to switch range from dependencies directly.
  let range;
  if (lastFilePath) {
    const item = pkgMap[join(lastFilePath, "package.json")];
    if (item && item.dependencies) {
      range = item.dependencies[pkg.name];
    }
    if (!range && item && item.devDependencies) {
      range = item.devDependencies[pkg.name];
    }
  }

  // Mutate the object.
  const resolvedPkg: IDependencies = {
    ...pkg,
    // Recurse.
    dependencies: pkg.dependencies
      .map((dep) => _resolveRangesOrNull(
        dep,
        pkgMap,
        pkg.filePath,
      ))
      .filter(Boolean),
    // Patch ranges
    range: range || pkg.range,
  } as IDependencies;

  return resolvedPkg;
};

// Correct ranges from package map.
const _resolveRanges = (
  pkg: IDependencies,
  pkgMap: INpmPackageMap,
): IDependencies => _resolveRangesOrNull(pkg, pkgMap) as IDependencies;

/**
 * Create a dependency graph as **depended**, irrespective of tree flattening.
 *
 * The basic scheme is as follows:
 * - Take in a pre-existing list of all possible package names to limit the
 *   I/O and recursion we're going to do
 * - Read in **all** potential packages from the starting file path (limited
 *   to _potential_ packages we need) to an object of file paths : package data.
 * - Recursively traverse up paths like real node resolution to find things
 *   while assembling our logical dependencies structure.
 *
 * @param   {String}                  filePath    full path to dir w/ `package.json`
 * @param   {String[]?}               pkgsFilter  limit to only these package names
 * @param   {INpmPackageMapPromise?}  cache       cache object
 * @returns {Promise<IDependencies | null>} dependencies graph object
 */
export const dependencies = (
  filePath: string,
  pkgsFilter?: string[],
  cache?: INpmPackageMapPromise,
): Promise<IDependencies | null> => {
  const _cache = cache || {};

  return Promise.resolve()
    // Read all packages.
    .then(() => readPackages(filePath, pkgsFilter, _cache))
    .then(_resolvePackageMap)
    // Start processing stuff.
    .then((pkgMap): IDependencies | null => {
      // Short-circuit empty package.
      const rootPkg = pkgMap[join(filePath, "package.json")];
      if (rootPkg === null || rootPkg === undefined) { return null; }

      // console.log("TODO HERE deps", JSON.stringify({
      //   filePath,
      //   pkgMap,
      // }, null, 2));

      // Have a real package, start inflating.
      // Include devDependencies in root of project because _could_ end up in
      // real final bundle.
      const names = ([] as string[]).concat(
        Object.keys(rootPkg.dependencies || {}),
        Object.keys(rootPkg.devDependencies || {}),
      );
      let pkg: IDependencies = {
        dependencies: _recurseDependencies({
          filePath,
          names,
          pkgMap,
          pkgsFilter,
        }),
        filePath,
        name: rootPkg.name || "ROOT",
        range: rootPkg.version || "*", // Root package doesn't have a range.
        version: rootPkg.version || "*",
      };

      // At this point, we now have a potentially circular object with pointers.
      // We want to convert it as follows:
      // 1. Unwind and "flatten" the pointers.
      // 2. Resolve any circular pointers.
      // 3. Fix any ranges from last path before flattened package.

      // Post process the object and resolve circular references + flatten.
      pkg = _resolveRefs(pkg);

      // Post process to correct ranges. There will likely be some wrong before
      // we do this.
      pkg = _resolveRanges(pkg, pkgMap);

      return pkg;
    });
};

export interface IDependenciesByPackageName {
  [packageName: string]: {
    [version: string]: {
      [filePath: string]: {
        skews: INpmPackageBase[][];
      };
    };
  };
}

// Internal implementation.
const _mapDepsToPackageName = (
  deps: IDependencies,
  depsMap: IDependenciesByPackageName,
  pkgsPath?: INpmPackageBase[],
): IDependenciesByPackageName => {
  // Current level, path.
  const curPath = (pkgsPath || []).concat({
    name: deps.name,
    range: deps.range,
    version: deps.version,
  });

  // Mutate map.
  depsMap[deps.name] = depsMap[deps.name] || {};
  const depsByVers = depsMap[deps.name][deps.version] = depsMap[deps.name][deps.version] || {};
  const depsByFileName = depsByVers[deps.filePath] = depsByVers[deps.filePath] || { skews: [] };
  depsByFileName.skews.push(curPath);

  // Recurse.
  deps.dependencies.forEach((dep) => {
    _mapDepsToPackageName(dep, depsMap, curPath);
  });

  return depsMap;
};

/**
 * Create a lookup table by package name + version.
 *
 * @param   {IDependencies}               deps  dependencies graph
 * @returns {IDependenciesByPackageName}        lookup table
 */
export const mapDepsToPackageName = (
  deps: IDependencies,
): IDependenciesByPackageName => _mapDepsToPackageName(deps, {});
