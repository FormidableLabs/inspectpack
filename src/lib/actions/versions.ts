import chalk from "chalk";
import { join, normalize, relative, sep } from "path";

import { IActionModule, IModule } from "../interfaces/modules";
import {
  dependencies,
  IDependencies,
  IDependenciesByPackageName,
  INpmPackageBase,
  mapDepsToPackageName,
} from "../util/dependencies";
import { exists, toPosixPath } from "../util/files";
import { numF, sort } from "../util/strings";
import {
  Action,
  IAction,
  IActionConstructor,
  ITemplate,
  nodeModulesParts,
  Template,
} from "./base";

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
 * @returns {string[]} list of package roots.
 */
const packagesRoots = (mods: IModule[]): string[] => {
  const roots: string[] = [];

  // Iterate node_modules modules and add to list of roots.
  mods
    .filter((mod) => mod.isNodeModules)
    .forEach((mod) => {
      const parts = mod.identifier.split(sep);
      const nmIndex = parts.indexOf("node_modules");
      const candidate = parts.slice(0, nmIndex).join(sep);

      if (roots.indexOf(candidate) === -1) {
        // Add unique root.
        roots.push(candidate);
      }
    });

  return roots.sort();
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
 * @param mods {Array<IModule>} array of module objects.
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
    // **Note**: use `normalize` to convert package name _back_ to windows if applicable.
    const pkgMap = modsMap[pkgName];
    const pkgPath = mod.identifier.substr(0, mod.identifier.length - mod.baseName.length)
      + normalize(pkgName);
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
  dependedPackages: {
    num: number,
  };
  // Total number of bundled files across all packages.
  files: {
    num: number,
  };
  // Unique package names with skews.
  skewedPackages: {
    num: number,
  };
  // Total number of skewed packages.
  skewedVersions: {
    num: number,
  };
}

interface IVersionsSummary extends IVersionsMeta {
  // Inferred base path of the project / node_modules.
  packageRoots: string[];
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
  dependedPackages: {
    num: 0,
  },
  files: {
    num: 0,
  },
  skewedPackages: {
    num: 0,
  },
  skewedVersions: {
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
    packageRoots: [],
  },
});

const getAssetData = (
  pkgRoots: string[],
  allDeps: Array<IDependencies | null>,
  mods: IModule[],
): IVersionsAsset => {
  // Start assembling and merging in deps for each package root.
  const data = createEmptyAsset();
  const modsMap = modulesByPackageNameByPackagePath(mods);

  allDeps.forEach((deps, depsIdx) => {
    // Skip nulls.
    if (deps === null) { return; }

    // Add in dependencies skews for all duplicates.
    // Get map of `name -> version -> IDependenciesByPackageName[] | [{ filePath }]`.
    const depsToPackageName = mapDepsToPackageName(deps);

    // Go through and match to our map of `name -> filePath -> IModule[]`.
    Object.keys(modsMap).sort(sort).forEach((name) => {
      // Use the modules as an "is present" lookup table.
      const modsToFilePath = modsMap[name] || {};

      Object.keys(depsToPackageName[name] || {}).sort(sort).forEach((version) => {
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
          const relPath = toPosixPath(relative(pkgRoots[depsIdx], filePath));

          // Late patch everything.
          data.packages[name] = data.packages[name] || {};
          const dataVers = data.packages[name][version] = data.packages[name][version] || {};
          const dataObj = dataVers[relPath] = dataVers[relPath] || {};
          dataObj.skews = depsForPkgVers[filePath].skews;
          dataObj.modules = (dataObj.modules || []).concat(modules);
        });
      });
    });
  });

  return data;
};

class Versions extends Action {
  protected _getData(): Promise<IVersionsData> {
    const mods = this.modules;

    // Infer the absolute paths to the package roots.
    const pkgRoots = packagesRoots(mods);

    // If we don't have a package root, then we have no dependencies in the
    // bundle and we can short circuit.
    if (!pkgRoots.length) {
      return Promise.resolve(createEmptyData());
    }

    // We now have a guaranteed non-empty string. Get modules map and filter to
    // limit I/O to only potential packages.
    const pkgsFilter = allPackages(mods);

    // Recursively read in dependencies.
    let allDeps: Array<IDependencies | null>;
    return Promise.all(pkgRoots.map((pkgRoot) => dependencies(pkgRoot, pkgsFilter)))
      // Capture deps.
      .then((all) => { allDeps = all; })
      // Check dependencies and validate.
      .then(() => Promise.all(allDeps.map((deps, i) => {
        // We're going to _mostly_ permissively handle uninstalled trees, but
        // we will error if `node_modules` doesn't exist which means likely that
        // an `npm install` is needed.
        if (deps !== null && !deps.dependencies.length) {
          const pkgNodeModules = join(pkgRoots[i], "node_modules");
          return exists(pkgNodeModules)
            .then((nmExists) => {
              if (!nmExists) {
                throw new Error(
                  `Found ${mods.length} bundled files in 'node_modules', but ` +
                  `'${pkgNodeModules}' doesn't exist. ` +
                  `Do you need to run 'npm install'?`,
                );
              }
            });
        }
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

        // Create root data without meta summary.
        const data: IVersionsData =  {
          ...createEmptyData(),
          assets: assetNames.reduce((memo, assetName) => ({
            ...memo,
            [assetName]: getAssetData(pkgRoots, allDeps, assets[assetName].mods),
          }), {}),
        };

        // Attach root-level meta.
        data.meta.packageRoots = pkgRoots;
        assetNames.forEach((assetName) => {
          const { packages } = data.assets[assetName];

          Object.keys(packages).forEach((pkgName) => {
            const pkgVersions = Object.keys(packages[pkgName]);

            data.meta.skewedPackages.num += 1;
            data.meta.skewedVersions.num += pkgVersions.length;
            pkgVersions.forEach((version) => {
              const pkgVers = packages[pkgName][version];
              Object.keys(pkgVers).forEach((filePath) => {
                data.meta.files.num += pkgVers[filePath].modules.length;
                data.meta.dependedPackages.num += pkgVers[filePath].skews.length;
              });
            });
          });

        });

        return data;
      });
  }

  protected _createTemplate(): ITemplate {
    return new VersionsTemplate({ action: this });
  }
}

// `~/different-foo/~/foo`
const shortPath = (filePath: string) => filePath.replace(/node_modules/g, "~");
// `duplicates-cjs@1.2.3 -> different-foo@1.1.1 -> foo@3.3.3`
const pkgNamePath = (pkgParts: INpmPackageBase[]) => pkgParts.reduce(
  (m, part) => `${m}${m ? " -> " : ""}${part.name}@${part.version}`,
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
                .sort(sort)
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
                            .map((pkgParts) => pkgParts.map((part) => ({
                              ...part,
                              name: chalk.gray(part.name),
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
          * Packages w/ Skews:        ${numF(meta.skewedPackages.num)}
          * Total skewed versions:    ${numF(meta.skewedVersions.num)}
          * Total depended packages:  ${numF(meta.dependedPackages.num)}
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
              .sort(sort)
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
