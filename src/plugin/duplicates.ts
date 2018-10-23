import chalk from "chalk";
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
interface ICompiler {
  hooks: any;
  plugin: (name: string, callback: () => void) => void;
}

interface ICompilation {
  errors: Error[];
  warnings: Error[];
  getStats: () => {
    toJson: () => IWebpackStats;
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
}

interface IPackageNames {
  [asset: string]: Set<string>;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const { log } = console;

const identical = (val: string) => chalk`{bold.magenta ${val}}`;
const similar = (val: string) => chalk`{bold.blue ${val}}`;
const warning = (val: string) => chalk`{bold.yellow ${val}}`;
const error = (val: string) => chalk`{bold.red ${val}}`;

// `~/different-foo/~/foo`
const shortPath = (filePath: string) => filePath.replace(/node_modules/g, "~");

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
// TODO: HERE TEST
export const _getDuplicatesVersionsData = (
  dupData: IDuplicatesData,
  pkgDataOrig: IVersionsData,
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
        meta.skewedPackages.num -= 1;
        meta.skewedVersions.num -= pkgVersions.length;

        pkgData.meta.skewedPackages.num -= 1;
        pkgData.meta.skewedVersions.num -= pkgVersions.length;

        pkgVersions.forEach((version) => {
          const pkgVers = packages[pkgName][version];
          Object.keys(pkgVers).forEach((filePath) => {
            meta.files.num -= pkgVers[filePath].modules.length;
            meta.dependedPackages.num -= pkgVers[filePath].skews.length;
            meta.installedPackages.num -= 1;

            pkgData.meta.files.num -= pkgVers[filePath].modules.length;
            pkgData.meta.dependedPackages.num -= pkgVers[filePath].skews.length;
            pkgData.meta.installedPackages.num -= 1;
          });
        });

        // Remove package.
        delete packages[pkgName];
      });
  });

  return pkgData;
};

// ----------------------------------------------------------------------------
// Plugin
// ----------------------------------------------------------------------------
export class DuplicatesPlugin {
  private opts: IDuplicatesPluginConstructor;

  constructor(opts: IDuplicatesPluginConstructor | null) {
    opts = opts || {};

    this.opts = {};
    this.opts.verbose = opts.verbose === true; // default `false`
    this.opts.emitErrors = opts.emitErrors === true; // default `false`
  }

  public apply(compiler: ICompiler) {
    if (compiler.hooks) {
      // Webpack4 integration
      compiler.hooks.emit.tapPromise("inspectpack-duplicates-plugin", this.analyze.bind(this));
    } else {
      // Webpack1-3 integration
      compiler.plugin("emit", this.analyze.bind(this));
    }
  }

  public analyze(compilation: ICompilation, callback: () => void) {
    const { errors, warnings } = compilation;
    const stats = compilation.getStats().toJson();

    const { emitErrors, verbose } = this.opts;

    // Stash messages for output to console (success) or compilation warnings
    // or errors arrays on duplicates found.
    const msgs: string[] = [];
    const addMsg = (msg: string) => msgs.push(msg);

    return Promise.all([
      actions("duplicates", { stats }).then((a) => a.getData() as Promise<IDuplicatesData>),
      actions("versions", { stats }).then((a) => a.getData() as Promise<IVersionsData>),
    ])
      .then((datas) => {
        const [dupData, pkgDataOrig] = datas;
        const header = chalk`{bold.underline Duplicate Sources / Packages}`;

        // No duplicates.
        if (dupData.meta.extraFiles.num === 0) {
          log(chalk`\n${header} - {green No duplicates found. 🚀}\n`);
          return;
        }

        // Filter versions/packages data to _just_ duplicates.
        const pkgData = _getDuplicatesVersionsData(dupData, pkgDataOrig);

        // Choose output format.
        const fmt = emitErrors ? error : warning;

        // Have duplicates. Report summary.
        // tslint:disable max-line-length
        addMsg(chalk`${header} - ${fmt("Duplicates found! ⚠️")}

* {yellow.bold.underline Duplicates}: Found a total of ${numF(dupData.meta.extraFiles.num)} ${similar("similar")} files across ${numF(dupData.meta.extraSources.num)} code sources (both ${identical("identical")} + similiar) accounting for ${numF(dupData.meta.extraSources.bytes)} bundled bytes.
* {yellow.bold.underline Packages}: Found a total of ${numF(pkgData.meta.skewedPackages.num)} packages with ${numF(pkgData.meta.skewedVersions.num)} {underline resolved}, ${numF(pkgData.meta.installedPackages.num)} {underline installed}, and ${numF(pkgData.meta.dependedPackages.num)} {underline depended} versions.
`);
        // tslint:enable max-line-length

        Object.keys(pkgData.assets).forEach((dupAssetName) => {
          const pkgAsset = pkgData.assets[dupAssetName];
          // TODO(RYAN): Don't output if no duplicates/versions?
          addMsg(chalk`{gray ## ${dupAssetName}}`);

          let dupsByFile: IDuplicatesByFile = {};
          if (dupData.assets[dupAssetName] &&
            dupData.assets[dupAssetName].files) {
            dupsByFile = getDuplicatesByFile(dupData.assets[dupAssetName].files);
          }

          const { packages } = pkgAsset;
          Object.keys(packages).forEach((pkgName) => {
            // Calculate stats / info during maps.
            // TODO(RYAN): Need a semver compatible sort!!!
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
                    .map((pkgParts) => pkgParts.map((part, i) => ({
                      ...part,
                      name: chalk[i < pkgParts.length - 1 ? "gray" : "cyan"](part.name),
                    })))
                    .map(pkgNamePath)
                    .sort(sort);

                  numPkgDepended += skews.length;

                  if (!verbose) {
                    return chalk`  {green ${version}} {gray ${shortPath(installed)}}
    ${skews.join("\n    ")}`;
                  }

                  const duplicates = packages[pkgName][version][installed].modules
                    .map((mod) => dupsByFile[mod.fileName])
                    .filter(Boolean)
                    .map((mod) => {
                      const note = mod.isIdentical ? identical("I") : similar("S");
                      return chalk`{gray ${mod.baseName}} (${note}, ${numF(mod.bytes)})`;
                    });

                  // TODO_DEBUG_REMOVE: No duplicates
                  // if (!duplicates.length) {
                  //   console.log("TODO HERE NO DUPS", {
                  //     modules: packages[pkgName][version][installed].modules
                  //   }, null, 2);
                  // }

                  return chalk`    {gray ${shortPath(installed)}}
      {white * Dependency graph}
        ${skews.join("\n        ")}
      {white * Duplicated files in }{gray ${dupAssetName}}
        ${duplicates.join("\n        ")}
`;

// TODO_DEBUG_REMOVE: ORIGINAL MODULES:
// ${JSON.stringify({
//   modules: packages[pkgName][version][installed].modules,
//   dups: dupData.assets[dupAssetName]
// }, null, 2)}
                });

                if (verbose) {
                  installs = [chalk`  {green ${version}}`].concat(installs);
                }

                return installs;
              })
              .reduce((m, a) => m.concat(a)); // flatten.

            // tslint:disable-next-line max-line-length
            addMsg(chalk`{cyan ${pkgName}} (Found ${numF(numPkgResolved)} {underline resolved}, ${numF(numPkgInstalled)} {underline installed}, ${numF(numPkgDepended)} {underline depended}. Latest {green ${latestVersion || "NONE"}}.)`);
            versions.forEach(addMsg);

            if (!verbose) {
              addMsg(""); // extra newline in terse mode.
            }
          });
        });
        // tslint:disable max-line-length
        addMsg(chalk`
* {yellow.bold.underline Understanding the report}: Need help with the details? See:
  https://github.com/FormidableLabs/inspectpack/blob/master/README.md#diagnosing-duplicates
* {yellow.bold.underline Fixing build duplicates}: An introductory guide:
  https://github.com/FormidableLabs/inspectpack/blob/naster/README.md#fixing-bundle-duplicates
`.trimLeft());
        // tslint:enable max-line-length

        // Drain messages into warnings or Errors.
        const output = emitErrors ? errors : warnings;
        output.push(new Error(msgs.join("\n")));

        // TODO_DEBUG_REMOVE
        // console.log(msgs.join("\n"));
        // console.log("TODO HERE REMOVE", JSON.stringify({
        //   dupData,
        //   pkgData,
        // }, null, 2)
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
