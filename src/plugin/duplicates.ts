import * as colors from "picocolors";
import semverCompare = require("semver-compare");
import { actions } from "../lib";
import { IDuplicatesData, IDuplicatesFiles } from "../lib/actions/duplicates";
import { _packageName, IVersionsData } from "../lib/actions/versions";
import { IWebpackStats } from "../lib/interfaces/webpack-stats";
import { INpmPackageBase } from "../lib/util/dependencies";
import { numF, sort } from "../lib/util/strings";

// ----------------------------------------------------------------------------
// Interfaces
// ----------------------------------------------------------------------------

// Simple interfaces for webpack work.
// See, e.g. https://github.com/TypeStrong/ts-loader/blob/master/src/interfaces.ts

// Permissive compiler type that spans webpack v1 - current.
interface ICompiler {
  hooks?: any;
  plugin?: (name: string, callback: () => void) => void;
}

export interface ICompilation {
  errors: Error[];
  warnings: Error[];
  getStats: () => {
    toJson: (opts: object) => IWebpackStats;
  };
}

interface IDuplicatesByFileModule {
  baseName: string;
  bytes: number;
  isIdentical: boolean;
}

interface IDuplicatesByFile {
  [fileName: string]: IDuplicatesByFileModule;
}

interface IDuplicatesPluginConstructor {
  verbose?: boolean;
  emitErrors?: boolean;
  emitHandler?: (report: string) => {};
  ignoredPackages?: (string | RegExp)[];
}

interface IPackageNames {
  [asset: string]: Set<string>;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const identical = (val: string) => colors.magenta(val);
const similar = (val: string) => colors.blue(val);
const warning = (val: string) => colors.yellow(val);
const error = (val: string) => colors.red(val);

// `~/different-foo/~/foo` + highlight last component.
const shortPath = (filePath: string, pkgName: string) => {
  let short = filePath.replace(/node_modules/g, "~");

  // Color last part of package name.
  const lastPkgIdx = short.lastIndexOf(pkgName);
  if (lastPkgIdx > -1) {
    short = `${short.substring(0, lastPkgIdx)}${colors.cyan(pkgName)}`;
  }

  return short;
};

// `duplicates-cjs@1.2.3 -> different-foo@1.1.1 -> foo@3.3.3`
const pkgNamePath = (pkgParts: INpmPackageBase[]) => pkgParts.reduce(
  (m, part) => `${m}${m ? " -> " : ""}${part.name}@${part.range}`,
  "",
);

// Organize duplicates by package name.
const getDuplicatesByFile = (files: IDuplicatesFiles) => {
  const dupsByFile: IDuplicatesByFile = {};

  Object.keys(files).forEach((fileName) => {
    files[fileName].sources.forEach((source) => {
      source.modules.forEach((mod) => {
        dupsByFile[mod.fileName] = {
          baseName: mod.baseName || mod.fileName,
          bytes: mod.size.full,
          isIdentical: source.meta.extraSources.num > 1,
        };
      });
    });
  });

  return dupsByFile;
};

// Return object of asset names keyed to sets of package names with duplicates.
const getDuplicatesPackageNames = (data: IDuplicatesData): IPackageNames => {
  const names: IPackageNames = {};

  Object.keys(data.assets).forEach((assetName) => {
    // Convert to package names.
    const pkgNames = Object.keys(data.assets[assetName].files).map(_packageName);

    // Unique names.
    const uniqPkgNames = new Set(pkgNames);

    names[assetName] = uniqPkgNames;
  });

  return names;
};

// Return a new versions object with _only_ duplicates packages included.
export const _getDuplicatesVersionsData = (
  dupData: IDuplicatesData,
  pkgDataOrig: IVersionsData,
  addWarning: (val: string) => number,
): IVersionsData => {
  // Start with a clone of the data.
  const pkgData: IVersionsData = JSON.parse(JSON.stringify(pkgDataOrig));
  const assetsToDupPkgs = getDuplicatesPackageNames(dupData);

  // Iterate the data and mutate meta _and_ resultant entries.
  Object.keys(pkgData.assets).forEach((assetName) => {
    const dupPkgs = assetsToDupPkgs[assetName] || new Set();
    const { meta, packages } = pkgData.assets[assetName];

    Object.keys(packages)
      // Identify the packages that are not duplicates.
      .filter((pkgName) => !dupPkgs.has(pkgName))
      // Mutate packages and meta.
      // Basically, unwind exactly everything from `versions.ts`.
      .forEach((pkgName) => {
        const pkgVersions = Object.keys(packages[pkgName]);

        // Unwind stats.
        meta.packages.num -= 1;
        meta.resolved.num -= pkgVersions.length;

        pkgData.meta.packages.num -= 1;
        pkgData.meta.resolved.num -= pkgVersions.length;

        pkgVersions.forEach((version) => {
          const pkgVers = packages[pkgName][version];
          Object.keys(pkgVers).forEach((filePath) => {
            meta.files.num -= pkgVers[filePath].modules.length;
            meta.depended.num -= pkgVers[filePath].skews.length;
            meta.installed.num -= 1;

            pkgData.meta.files.num -= pkgVers[filePath].modules.length;
            pkgData.meta.depended.num -= pkgVers[filePath].skews.length;
            pkgData.meta.installed.num -= 1;
          });
        });

        // Remove package.
        delete packages[pkgName];
      });
  });

  // Validate mutated package data by checking we have matching number of
  // sources (identical or not).
  const extraSources = dupData.meta.extraSources.num;

  interface IFilesMap { [baseName: string]: number; }
  const foundFilesMap: IFilesMap = {};
  Object.keys(pkgData.assets).forEach((assetName) => {
    const pkgs = pkgData.assets[assetName].packages;
    Object.keys(pkgs).forEach((pkgName) => {
      Object.keys(pkgs[pkgName]).forEach((pkgVers) => {
        const pkgInstalls = pkgs[pkgName][pkgVers];
        Object.keys(pkgInstalls).forEach((installPath) => {
          pkgInstalls[installPath].modules.forEach((mod) => {
            if (!mod.baseName) { return; }
            foundFilesMap[mod.baseName] = (foundFilesMap[mod.baseName] || 0) + 1;
          });
        });
      });
    });
  });
  const foundDupFilesMap: IFilesMap = {};
  Object.keys(foundFilesMap).forEach((baseName) => {
    if (foundFilesMap[baseName] >= 2) {
      foundDupFilesMap[baseName] = foundFilesMap[baseName];
    }
  });
  const foundSources = Object.keys(foundDupFilesMap)
    .reduce((memo, baseName) => {
      return memo + foundDupFilesMap[baseName];
    }, 0);

  if (extraSources !== foundSources) {
    addWarning(error(
      `Missing sources: Expected ${numF(extraSources)}, found ${numF(foundSources)}.\n` +
      `${colors.white("Found map:")} ${colors.gray(JSON.stringify(foundDupFilesMap))}\n`,
    ));
  }

  return pkgData;
};

// ----------------------------------------------------------------------------
// Plugin
// ----------------------------------------------------------------------------
export class DuplicatesPlugin {
  private opts: IDuplicatesPluginConstructor;

  constructor({verbose, emitErrors, emitHandler, ignoredPackages}: IDuplicatesPluginConstructor = {}) {
    this.opts = {
      emitErrors: emitErrors === true, // default `false`
      emitHandler: typeof emitHandler === "function" ? emitHandler : undefined,
      ignoredPackages: Array.isArray(ignoredPackages) ? ignoredPackages : undefined,
      verbose: verbose === true, // default `false`
    };
  }

  public apply(compiler: ICompiler) {
    if (compiler.hooks) {
      // Webpack4+ integration
      compiler.hooks.emit.tapPromise("inspectpack-duplicates-plugin", this.analyze.bind(this));
    } else if (compiler.plugin) {
      // Webpack1-3 integration
      compiler.plugin("emit", this.analyze.bind(this) as any);
    } else {
      throw new Error("Unrecognized compiler format");
    }
  }

  public analyze(compilation: ICompilation, callback?: () => void) {
    const { errors, warnings } = compilation;
    const stats = compilation
      .getStats()
      .toJson({
        source: true // Needed for webpack5+
      });

    const { emitErrors, emitHandler, ignoredPackages, verbose } = this.opts;

    // Stash messages for output to console (success) or compilation warnings
    // or errors arrays on duplicates found.
    const msgs: string[] = [];
    const addMsg = (msg: string) => msgs.push(msg);

    return Promise.all([
      actions("duplicates", { stats, ignoredPackages }).then((a) => a.getData() as Promise<IDuplicatesData>),
      actions("versions", { stats, ignoredPackages }).then((a) => a.getData() as Promise<IVersionsData>),
    ])
      .then((datas) => {
        const [dupData, pkgDataOrig] = datas;
        const header = colors.bold(colors.underline("Duplicate Sources / Packages"));

        // No duplicates.
        if (dupData.meta.extraFiles.num === 0) {
          // tslint:disable no-console
          console.log(`\n${header} - ${colors.green("No duplicates found. 🚀")}\n`);
          return;
        }

        // Filter versions/packages data to _just_ duplicates.
        const pkgData = _getDuplicatesVersionsData(dupData, pkgDataOrig, addMsg);

        // Choose output format.
        const fmt = emitErrors ? error : warning;

        // Have duplicates. Report summary.
        // tslint:disable max-line-length
        addMsg(`${header} - ${fmt("Duplicates found! ⚠️")}

* ${colors.yellow(colors.bold(colors.underline("Duplicates")))}: Found ${numF(dupData.meta.extraFiles.num)} ${similar("similar")} files across ${numF(dupData.meta.extraSources.num)} code sources (both ${identical("identical")} + similar)
  accounting for ${numF(dupData.meta.extraSources.bytes)} bundled bytes.
* ${colors.yellow(colors.bold(colors.underline("Packages")))}: Found ${numF(pkgData.meta.packages.num)} packages with ${numF(pkgData.meta.resolved.num)} ${colors.underline("resolved")}, ${numF(pkgData.meta.installed.num)} ${colors.underline("installed")}, and ${numF(pkgData.meta.depended.num)} ${colors.underline("depended")} versions.
`);
        // tslint:enable max-line-length

        Object.keys(pkgData.assets).forEach((dupAssetName) => {
          const pkgAsset = pkgData.assets[dupAssetName];

          let dupsByFile: IDuplicatesByFile = {};
          if (dupData.assets[dupAssetName] &&
            dupData.assets[dupAssetName].files) {
            dupsByFile = getDuplicatesByFile(dupData.assets[dupAssetName].files);
          }

          const { packages } = pkgAsset;
          const pkgNames = Object.keys(packages);

          // Only add asset name when duplicates.
          if (pkgNames.length) {
            addMsg(colors.gray(`## ${dupAssetName}`));
          }

          pkgNames.forEach((pkgName) => {
            // Calculate stats / info during maps.
            let latestVersion;
            let numPkgInstalled = 0;
            const numPkgResolved = Object.keys(packages[pkgName]).length;
            let numPkgDepended = 0;

            const versions = Object.keys(packages[pkgName])
              .sort(semverCompare)
              .map((version) => {
                // Capture
                latestVersion = version; // Latest should be correct bc of `semverCompare`
                numPkgInstalled += Object.keys(packages[pkgName][version]).length;

                let installs = Object.keys(packages[pkgName][version]).map((installed) => {
                  const skews = packages[pkgName][version][installed].skews
                    .map((pkgParts) => pkgParts.map((part, i) => Object.assign({}, part, {
                      name: colors[i < pkgParts.length - 1 ? "gray" : "cyan"](part.name),
                    })))
                    .map(pkgNamePath)
                    .sort(sort);

                  numPkgDepended += skews.length;

                  if (!verbose) {
                    return `  ${colors.green(version)} ${colors.gray(shortPath(installed, pkgName))}
    ${skews.join("\n    ")}`;
                  }

                  const duplicates = packages[pkgName][version][installed].modules
                    .map((mod) => dupsByFile[mod.fileName])
                    .filter(Boolean)
                    .map((mod) => {
                      const note = mod.isIdentical ? identical("I") : similar("S");
                      return `${colors.gray(mod.baseName)} (${note}, ${numF(mod.bytes)})`;
                    });

                  return `    ${colors.gray(shortPath(installed, pkgName))}
      ${colors.white("* Dependency graph")}
        ${skews.join("\n        ")}
      ${colors.white("* Duplicated files in ")}${colors.gray(dupAssetName)}
        ${duplicates.join("\n        ")}
`;
                });

                if (verbose) {
                  installs = [`  ${colors.green(version)}`].concat(installs);
                }

                return installs;
              })
              .reduce((m, a) => m.concat(a), []); // flatten.

            // tslint:disable-next-line max-line-length
            addMsg(`${colors.cyan(pkgName)} (Found ${numF(numPkgResolved)} ${colors.underline("resolved")}, ${numF(numPkgInstalled)} ${colors.underline("installed")}, ${numF(numPkgDepended)} ${colors.underline("depended")}. Latest ${colors.green(latestVersion || "NONE")}.)`);
            versions.forEach(addMsg);

            if (!verbose) {
              addMsg(""); // extra newline in terse mode.
            }
          });
        });
        // tslint:disable max-line-length
        addMsg(`
* ${colors.gray(colors.bold(colors.underline("Understanding the report")))}: Need help with the details? See:
  https://github.com/FormidableLabs/inspectpack/#diagnosing-duplicates
* ${colors.gray(colors.bold(colors.underline("Fixing bundle duplicates")))}: An introductory guide:
  https://github.com/FormidableLabs/inspectpack/#fixing-bundle-duplicates
`.trimLeft());
        // tslint:enable max-line-length

        // Drain messages into custom handler or warnings/errors.
        const report = msgs.join("\n");
        if (emitHandler) {
          emitHandler(report);
        } else {
          const output = emitErrors ? errors : warnings;
          output.push(new Error(report));
        }
      })
      // Handle old plugin API callback.
      .then(() => {
        if (callback) { return void callback(); }
      })
      .catch((err) => {
        // Ignore error from old webpack.
        if (callback) { return void callback(); }
        throw err;
      });
  }
}
