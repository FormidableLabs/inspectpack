import * as chalk from "chalk";
import { dirname, join, relative, sep } from "path";
import semverCompare = require("semver-compare");

import { IActionModule, IModule } from "../interfaces/modules";
import {
  dependencies,
  IDependencies,
  IDependenciesByPackageName,
  INpmPackageBase,
  mapDepsToPackageName,
} from "../util/dependencies";
import { exists, toPosixPath } from "../util/files";
import { serial } from "../util/promise";
import { numF, sort } from "../util/strings";
import {
  _normalizeWebpackPath,
  Action,
  IAction,
  IActionConstructor,
  ITemplate,
  nodeModulesParts,
  Template,
} from "./base";

// Node.js `require`-compliant sorted order, in the **reverse** of what will
// be looked up so that we can seed the cache with the found packages from
// roots early.
//
// E.g.,
// - `/my-app/`
// - `/my-app/foo/`
// - `/my-app/foo/bar`
export const _requireSort = (vals: string[]) => {
  return vals.sort();
};

/**
 * Webpack projects can have multiple "roots" of `node_modules` that can be
 * the source of installed versions, including things like:
 *
 * - Node library deps: `/PATH/TO/node/v6.5.0/lib`
 * - Monorepo projects: `/PATH/TO/MY_PROJECT/package1`, `/PATH/TO/MY_PROJECT/package2`
 * - ... or the simple version of just one root for a project.
 *
 * The webpack stats object doesn't contain any information about what the root
 * / roots are, so we have to infer it, which we do by pulling apart the paths
 * of each `node_modules` installed module in a source bundle.
 *
 * @param mods {IModule[]} list of modules.
 * @returns {Promise<string[]>} list of package roots.
 */
export const _packageRoots = (mods: IModule[]): Promise<string[]> => {
  const depRoots: string[] = [];
  const appRoots: string[] = [];

  // Iterate node_modules modules and add to list of roots.
  mods
    .filter((mod) => mod.isNodeModules)
    .forEach((mod) => {
      const parts = _normalizeWebpackPath(mod.identifier).split(sep);
      const nmIndex = parts.indexOf("node_modules");
      const candidate = parts.slice(0, nmIndex).join(sep);

      if (depRoots.indexOf(candidate) === -1) {
        // Add unique root.
        depRoots.push(candidate);
      }
    });

  // If there are no dependency roots, then we don't care about dependencies
  // and don't need to find any application roots. Short-circuit.
  if (!depRoots.length) {
    return Promise.resolve(depRoots);
  }

  // Now, the tricky part. Find "hidden roots" that don't have `node_modules`
  // in the path, but still have a `package.json`. To limit the review of this
  // we only check up to a pre-existing root above that _is_ a `node_modules`-
  // based root, because that would have to exist if somewhere deeper in a
  // project had a `package.json` that got flattened.
  mods
    .filter((mod) => !mod.isNodeModules && !mod.isSynthetic)
    .forEach((mod) => {
      // Start at full path.
      // TODO(106): Revise code and tests for `fullPath`.
      // https://github.com/FormidableLabs/inspectpack/issues/106
      let curPath: string|null = _normalizeWebpackPath(mod.identifier);

      // We can't ever go below the minimum dep root.
      const depRootMinLength = depRoots
        .map((depRoot) => depRoot.length)
        .reduce((memo, len) => memo > 0 && memo < len ? memo : len, 0);

      // Iterate parts.
      // tslint:disable-next-line no-conditional-assignment
      while (curPath = curPath && dirname(curPath)) {
        // Stop if (1) below all dep roots, (2) hit existing dep root, or
        // (3) no longer _end_ at dep root
        if (
          depRootMinLength > curPath.length ||
          depRoots.indexOf(curPath) > -1 ||
          !depRoots.some((d) => !!curPath && curPath.indexOf(d) === 0)
        ) {
          curPath = null;
        } else if (appRoots.indexOf(curPath) === -1) {
          // Add potential unique root.
          appRoots.push(curPath);
        }
      }
    });

  // Check all the potential dep and app roots for the presence of a
  // `package.json` file. This is a bit of disk I/O but saves us later I/O and
  // processing to not have false roots in the list of potential roots.
  const roots = depRoots.concat(appRoots);
  return Promise.all(
    roots.map((rootPath) => exists(join(rootPath, "package.json"))),
  )
    .then((rootExists) => {
      const foundRoots = roots.filter((_, i) => rootExists[i]);
      return _requireSort(foundRoots);
    });
};

// Simple helper to get package name from a base name.
export const _packageName = (baseName: string) => {
  const base = toPosixPath(baseName.trim());
  if (!base) {
    throw new Error(`No package name was provided`);
  }

  const parts = base.split("/");
  if (parts[0].startsWith("@")) {
    if (parts.length >= 2) {
      // Scoped. Always use posix '/' separator.
      return [parts[0], parts[1]].join("/");
    }
    throw new Error(`${baseName} is scoped, but is missing package name`);
  }

  return parts[0]; // Normal.
};

// Create list of **all** packages potentially at issue, including intermediate
// ones
const allPackages = (mods: IModule[]): string[] => {
  // Intermediate map.
  const pkgs: { [key: string]: true } = {};

  mods
    .filter((mod) => mod.isNodeModules)
    .forEach((mod) => {
      // Posixified array of:
      // ["/PATH/TO", "/", "node_modules", "/", "package1", "/", "node_modules", ...]
      const parts = nodeModulesParts(mod.identifier)
        // Remove prefix and any intermediate "node_modules" or "/".
        .filter((part, i) => i > 0 && part !== "/" && part !== "node_modules");

      // Convert last part to a package name.
      const lastIdx = parts.length - 1;
      parts[lastIdx] = _packageName(parts[lastIdx]);

      parts.forEach((pkgName) => {
        pkgs[pkgName] = true;
      });
    });

  // Convert to list.
  return Object.keys(pkgs).sort(sort);
};

interface IModulesByPackageNameByPackagePath {
  [packageName: string]: {
    [packagePath: string]: IModule[];
  };
}

/**
 * Create map of `basename` -> `IModule`.
 *
 * @param mods {IModule[]} array of module objects.
 * @returns {IModulesByBaseName} map
 */
const modulesByPackageNameByPackagePath = (
  mods: IModule[],
): IModulesByPackageNameByPackagePath => {
  // Mutable, empty object to group base names with.
  const modsMap: IModulesByPackageNameByPackagePath = {};

  // Iterate node_modules modules and add to keyed object.
  mods.forEach((mod) => {
    if (!mod.isNodeModules) { return; }
    if (mod.baseName === null) { // Programming error.
      throw new Error(`Encountered non-node_modules null baseName: ${JSON.stringify(mod)}`);
    }

    // Insert package.
    const pkgName = _packageName(mod.baseName);
    modsMap[pkgName] = modsMap[pkgName] || {};

    // Insert package path. (All the different installs of package).
    const pkgMap = modsMap[pkgName];
    const modParts = _normalizeWebpackPath(mod.identifier).split(sep);
    const nmIndex = modParts.lastIndexOf("node_modules");
    const pkgPath = modParts
      // Remove base name path suffix.
      .slice(0, nmIndex + 1)
      // Add in parts of the package name (split with "/" because posixified).
      .concat(pkgName.split("/"))
      // Back to string.
      .join(sep);

    pkgMap[pkgPath] = (pkgMap[pkgPath] || []).concat(mod);
  });

  // Now, remove any single item keys (no duplicates).
  Object.keys(modsMap).forEach((pkgName) => {
    if (Object.keys(modsMap[pkgName]).length === 1) {
      delete modsMap[pkgName];
    }
  });

  return modsMap;
};

export interface IVersionsMeta {
  // Number of all unique depended packages (for any name, version).
  depended: {
    num: number,
  };
  // Total number of bundled files across all packages.
  files: {
    num: number,
  };
  // Total number of _on-disk_ packages installed for implicated versions.
  installed: {
    num: number,
  };
  // Unique package names with skews.
  packages: {
    num: number,
  };
  // Total number of resolved packages.
  resolved: {
    num: number,
  };
}

interface IVersionsSummary extends IVersionsMeta {
  // Inferred base path of the project / node_modules.
  packageRoots: string[];

  // Longest common path between package roots.
  // Installed paths are relative to this.
  commonRoot: string | null;
}

interface IVersionsPackages extends IDependenciesByPackageName {
  [packageName: string]: {
    [version: string]: {
      [filePath: string]: { // Note: **relative**, **Posix** path in final version
        modules: IActionModule[];
        skews: INpmPackageBase[][];
      };
    };
  };
}

interface IVersionsAsset {
  meta: IVersionsMeta;
  packages: IVersionsPackages;
}

export interface IVersionsData {
  assets: {
    [asset: string]: IVersionsAsset;
  };
  meta: IVersionsSummary;
}

const createEmptyMeta = (): IVersionsMeta => ({
  depended: {
    num: 0,
  },
  files: {
    num: 0,
  },
  installed: {
    num: 0,
  },
  packages: {
    num: 0,
  },
  resolved: {
    num: 0,
  },
});

const createEmptyAsset = (): IVersionsAsset => ({
  meta: createEmptyMeta(),
  packages: {},
});

const createEmptyData = (): IVersionsData => ({
  assets: {},
  meta: {
    ...createEmptyMeta(),
    commonRoot: null,
    packageRoots: [],
  },
});

// Find largest common match for `node_module` dependencies.
const commonPath = (val1: string, val2: string) => {
  // Find last common index.
  let i = 0;
  while (i < val1.length && val1.charAt(i) === val2.charAt(i)) {
    i++;
  }

  let candidate = val1.substring(0, i);

  // Remove trailing slash and trailing `node_modules` in order.
  const parts = candidate.split(sep);
  const nmIndex = parts.indexOf("node_modules");
  if (nmIndex > -1) {
    candidate = parts.slice(0, nmIndex).join(sep);
  }

  return candidate;
};

const getAssetData = (
  commonRoot: string,
  allDeps: (IDependencies | null)[],
  mods: IModule[],
): IVersionsAsset => {
  // Start assembling and merging in deps for each package root.
  const data = createEmptyAsset();
  const modsMap = modulesByPackageNameByPackagePath(mods);

  allDeps.forEach((deps) => {
    // Skip nulls.
    if (deps === null) { return; }

    // Add in dependencies skews for all duplicates.
    // Get map of `name -> version -> IDependenciesByPackageName[] | [{ filePath }]`.
    const depsToPackageName = mapDepsToPackageName(deps);

    // Go through and match to our map of `name -> filePath -> IModule[]`.
    Object.keys(modsMap).sort(sort).forEach((name) => {
      // Use the modules as an "is present" lookup table.
      const modsToFilePath = modsMap[name] || {};

      Object.keys(depsToPackageName[name] || {}).sort(semverCompare).forEach((version) => {
        // Have potential `filePath` match across mods and deps.
        // Filter to just these file paths.
        const depsForPkgVers = depsToPackageName[name][version] || {};
        Object.keys(depsForPkgVers).sort(sort).forEach((filePath) => {
          // Get applicable modules.
          const modules = (modsToFilePath[filePath] || []).map((mod) => ({
            baseName: mod.baseName,
            fileName: mod.identifier,
            size: {
              full: mod.size,
            },
          }));

          // Short-circuit -- need to actually **have** modules to add.
          if (!modules.length) { return; }

          // Need to posix-ify after call to `relative`.
          const relPath = toPosixPath(relative(commonRoot, filePath));

          // Late patch everything.
          data.packages[name] = data.packages[name] || {};
          const dataVers = data.packages[name][version] = data.packages[name][version] || {};
          const dataObj = dataVers[relPath] = dataVers[relPath] || {};
          dataObj.skews = (dataObj.skews || []).concat(depsForPkgVers[filePath].skews);

          dataObj.modules = dataObj.modules || [];
          // Add _new, unique_ modules.
          // Note that `baseName` might have multiple matches for duplicate installs, but
          // `fileName` won't.
          const newMods = modules
            .filter((newMod) => !dataObj.modules.some((mod) => mod.fileName === newMod.fileName));
          dataObj.modules = dataObj.modules.concat(newMods);
        });
      });
    });
  });

  return data;
};

class Versions extends Action {
  public shouldBail(): Promise<boolean> {
    return this.getData().then((data: object) =>
      (data as IVersionsData).meta.packages.num !== 0
    );
  }

  protected _getData(): Promise<IVersionsData> {
    const mods = this.modules;

    // Share a mutable package map cache across all dependency resolution.
    const pkgMap = {};

    // Infer the absolute paths to the package roots.
    //
    // The package roots come back in an order such that we cache things early
    // that may be used later for nested directories that may need to search
    // up higher for "flattened" dependencies.
    return _packageRoots(mods).then((pkgRoots) => {
      // If we don't have a package root, then we have no dependencies in the
      // bundle and we can short circuit.
      if (!pkgRoots.length) {
        return Promise.resolve(createEmptyData());
      }

      // We now have a guaranteed non-empty string. Get modules map and filter to
      // limit I/O to only potential packages.
      const pkgsFilter = allPackages(mods);

      // Recursively read in dependencies.
      //
      // However, since package roots rely on a properly seeded cache from earlier
      // runs with a higher-up, valid traversal path, we start bottom up in serial
      // rather than executing different roots in parallel.
      let allDeps: (IDependencies | null)[];
      return serial(
        pkgRoots.map((pkgRoot) => () => dependencies(pkgRoot, pkgsFilter, pkgMap)),
      )
        // Capture deps.
        .then((all) => { allDeps = all; })
        // Check dependencies and validate.
        .then(() => Promise.all(allDeps.map((deps) => {
          // We're going to _mostly_ permissively handle uninstalled trees, but
          // we will error if no `node_modules` exist which means likely that
          // an `npm install` is needed.
          if (deps !== null && !deps.dependencies.length) {
            return Promise.all(
              pkgRoots.map((pkgRoot) => exists(join(pkgRoot, "node_modules"))),
            )
              .then((pkgRootsExist) => {
                if (pkgRootsExist.indexOf(true) === -1) {
                  throw new Error(
                    `Found ${mods.length} bundled files in a project ` +
                    `'node_modules' directory, but none found on disk. ` +
                    `Do you need to run 'npm install'?`,
                  );
                }
              });
          }

          return Promise.resolve();
        })))
        // Assemble data.
        .then(() => {
          // Short-circuit if all null or empty array.
          // Really a belt-and-suspenders check, since we've already validated
          // that package.json exists.
          if (!allDeps.length || allDeps.every((deps) => deps === null)) {
            return createEmptyData();
          }

          const { assets } = this;
          const assetNames = Object.keys(assets).sort(sort);

          // Find largest-common-part of all roots for this version to do relative paths from.
          // **Note**: No second memo argument. First `memo` is first array element.
          const commonRoot = pkgRoots.reduce((memo, pkgRoot) => commonPath(memo, pkgRoot));

          // Create root data without meta summary.
          const data: IVersionsData =  {
            ...createEmptyData(),
            assets: assetNames.reduce((memo, assetName) => ({
              ...memo,
              [assetName]: getAssetData(commonRoot, allDeps, assets[assetName].mods),
            }), {}),
          };

          // Attach root-level meta.
          data.meta.packageRoots = pkgRoots;
          data.meta.commonRoot = commonRoot;

          // Each asset.
          assetNames.forEach((assetName) => {
            const { packages, meta } = data.assets[assetName];

            Object.keys(packages).forEach((pkgName) => {
              const pkgVersions = Object.keys(packages[pkgName]);

              meta.packages.num += 1;
              meta.resolved.num += pkgVersions.length;

              data.meta.packages.num += 1;
              data.meta.resolved.num += pkgVersions.length;

              pkgVersions.forEach((version) => {
                const pkgVers = packages[pkgName][version];
                Object.keys(pkgVers).forEach((filePath) => {
                  meta.files.num += pkgVers[filePath].modules.length;
                  meta.depended.num += pkgVers[filePath].skews.length;
                  meta.installed.num += 1;

                  data.meta.files.num += pkgVers[filePath].modules.length;
                  data.meta.depended.num += pkgVers[filePath].skews.length;
                  data.meta.installed.num += 1;
                });
              });
            });

          });

          return data;
        });
      });
  }

  protected _createTemplate(): ITemplate {
    return new VersionsTemplate({ action: this });
  }
}

// `~/different-foo/~/foo`
const shortPath = (filePath: string) => filePath.replace(/node_modules/g, "~");
// `duplicates-cjs@1.2.3 -> different-foo@^1.0.1 -> foo@^2.2.0`
const pkgNamePath = (pkgParts: INpmPackageBase[]) => pkgParts.reduce(
  (m, part) => `${m}${m ? " -> " : ""}${part.name}@${part.range}`,
  "",
);

class VersionsTemplate extends Template {
  public text(): Promise<string> {
    return Promise.resolve()
      .then(() => this.action.getData() as Promise<IVersionsData>)
      .then(({ meta, assets }) => {
        const versAsset = (name: string) => chalk`{gray ## \`${name}\`}`;
        const versPkgs = (name: string) => Object.keys(assets[name].packages)
          .sort(sort)
          .map((pkgName) => this.trim(chalk`
            * {cyan ${pkgName}}
              ${Object.keys(assets[name].packages[pkgName])
                .sort(semverCompare)
                .map((version) => this.trim(chalk`
                  * {gray ${version}}
                    ${Object.keys(assets[name].packages[pkgName][version])
                      .sort(sort)
                      .map((filePath) => {
                        const {
                          skews,
                          modules,
                        } = assets[name].packages[pkgName][version][filePath];

                        return this.trim(chalk`
                        * {green ${shortPath(filePath)}}
                          * Num deps: ${numF(skews.length)}, files: ${numF(modules.length)}
                          ${skews
                            .map((pkgParts) => pkgParts.map((part, i) => ({
                              ...part,
                              name: chalk[i < pkgParts.length - 1 ? "gray" : "cyan"](part.name),
                            })))
                            .map(pkgNamePath)
                            .sort(sort)
                            .map((pkgStr) => this.trim(`
                              * ${pkgStr}
                            `, 24))
                            .join("\n      ")
                          }
                        `, 20);
                      })
                      .join("\n    ")
                    }
                `, 16))
                .join("\n  ")
              }
          `, 12))
          .join("\n");
        const versions = (name: string) => `${versAsset(name)}\n${versPkgs(name)}\n`;

        const report = this.trim(chalk`
          {cyan inspectpack --action=versions}
          {gray =============================}

          {gray ## Summary}
          * Packages with skews:      ${numF(meta.packages.num)}
          * Total resolved versions:  ${numF(meta.resolved.num)}
          * Total installed packages: ${numF(meta.installed.num)}
          * Total depended packages:  ${numF(meta.depended.num)}
          * Total bundled files:      ${numF(meta.files.num)}

          ${Object.keys(assets)
            .filter((name) => Object.keys(assets[name].packages).length)
            .map(versions)
            .join("\n")}
        `, 10);

        return report;
      });
  }

  public tsv(): Promise<string> {
    return Promise.resolve()
      .then(() => this.action.getData() as Promise<IVersionsData>)
      .then(({ assets }) => ["Asset\tPackage\tVersion\tInstalled Path\tDependency Path"]
        .concat(Object.keys(assets)
          .filter((name) => Object.keys(assets[name].packages).length)
          .map((name) => Object.keys(assets[name].packages)
            .sort(sort)
            .map((pkgName) => Object.keys(assets[name].packages[pkgName])
              .sort(semverCompare)
              .map((version) => Object.keys(assets[name].packages[pkgName][version])
                .sort(sort)
                .map((filePath) => assets[name].packages[pkgName][version][filePath].skews
                  .map(pkgNamePath)
                  .sort(sort)
                  .map((pkgStr) => [
                      name,
                      pkgName,
                      version,
                      shortPath(filePath),
                      pkgStr,
                    ].join("\t"))
                  .join("\n"))
                .join("\n"))
              .join("\n"))
            .join("\n"))
          .join("\n"))
        .join("\n"));
  }
}

export const create = (opts: IActionConstructor): IAction => {
  return new Versions(opts);
};
