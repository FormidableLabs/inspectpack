import * as chalk from "chalk";
import semverCompare = require("semver-compare");
import { actions } from "../lib";
import { _packageName, IVersionsData, IVersionsDataAssets } from "../lib/actions/versions";
import { numF, sort } from "../lib/util/strings";
import { pkgNamePath, ICompiler, ICompilation } from "./common";

// ----------------------------------------------------------------------------
// Interfaces
// ----------------------------------------------------------------------------
interface IVersionsPluginConstructor {
  duplicatesOnly?:boolean;
  verbose?: boolean;
  emitErrors?: boolean;
  emitHandler?: (report: string) => {};
  ignoredPackages?: (string | RegExp)[];
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
// return version messages of pkgName
const getVersions = (assetName: string, pkgName:string, assets: IVersionsDataAssets): string[] => {
  const data: string[] = [];
  data.push(chalk`* {cyan ${pkgName}}`);
  Object.keys(assets[assetName].packages[pkgName])
  .sort(semverCompare)
  .forEach((version) => {
    data.push(chalk`  * {gray ${version}}`);
    Object.keys(assets[assetName].packages[pkgName][version])
      .sort(sort)
      .forEach((filePath) => {
        const {
          skews,
          modules,
        } = assets[assetName].packages[pkgName][version][filePath];

        data.push(chalk`    * Num deps: ${numF(skews.length)}, files: ${numF(modules.length)}`);
        skews.map((pkgParts) => pkgParts.map((part, i) => Object.assign({}, part, {
            name: chalk[i < pkgParts.length - 1 ? "gray" : "cyan"](part.name),
          })))
          .map(pkgNamePath)
          .sort(sort)
          .forEach((pkgStr) => data.push(`      * ${pkgStr}`));
      });
    });
  return data;
}

// ----------------------------------------------------------------------------
// Plugin
// ----------------------------------------------------------------------------
export class VersionsPlugin {
  private opts: IVersionsPluginConstructor;

  constructor({duplicatesOnly, verbose, emitErrors, emitHandler, ignoredPackages}: IVersionsPluginConstructor = {}) {
    this.opts = {
      emitErrors: emitErrors === true, // default `false`
      emitHandler: typeof emitHandler === "function" ? emitHandler : undefined,
      ignoredPackages: Array.isArray(ignoredPackages) ? ignoredPackages : undefined,
      verbose: verbose === true, // default `false`
      duplicatesOnly: duplicatesOnly !== false,  // default `true`
    };
  }

  public apply(compiler: ICompiler) {
    if (compiler.hooks) {
      // Webpack4+ integration
      compiler.hooks.emit.tapPromise("inspectpack-versions-plugin", this.analyze.bind(this));
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

    const { emitErrors, emitHandler, ignoredPackages, duplicatesOnly } = this.opts;

    // Stash messages for output to console (success) or compilation warnings
    // or errors arrays on duplicates found.
    const msgs: string[] = [];
    const dupPkgMsgs: string[] = [];
    const singlePkgMsgs: string[] = [];

    return Promise.resolve()
      .then(() => actions("versions", { stats, ignoredPackages, duplicatesOnly }))
      .then((a) => a.getData() as Promise<IVersionsData>)
      .then((data) => {
        const { assets } = data;
        Object.keys(assets)
        .filter((assetName) => Object.keys(assets[assetName].packages).length)
        .forEach((assetName) => {
          // For each asset, report duplicated packages and single version packages seperately
          const dupPkgForAsset: string[] = [];
          const singlePkgForAsset: string[] = [];

          Object.keys(assets[assetName].packages)
          .sort(sort)
          .forEach((pkgName) => {
            if (Object.keys(assets[assetName].packages[pkgName]).length > 1) {
              dupPkgForAsset.push(...getVersions(assetName, pkgName, assets));
            } else {
              singlePkgForAsset.push(...getVersions(assetName, pkgName, assets));
            }
          });

          if (dupPkgForAsset.length > 1) {
            dupPkgMsgs.push(chalk `{gray ## \`${assetName}\`}`, ...dupPkgForAsset, '');
          }
          if (singlePkgForAsset.length > 1) {
            singlePkgMsgs.push(chalk `{gray ## \`${assetName}\`}`, ...singlePkgForAsset, '');
          }
        });

      msgs.push(chalk`{bold.underline Versions info} - {bold.yellow ${duplicatesOnly ? 'Duplicates Only': 'All Packages'}}\n`);
      msgs.push(chalk`{underline Single version packages}`);
      (singlePkgMsgs.length > 1) ? msgs.push(...singlePkgMsgs) : msgs.push(chalk`    {red n/a}\n`);
      msgs.push(chalk`{underline Duplicate version packages}`);
      (dupPkgMsgs.length > 1) ? msgs.push(...dupPkgMsgs) : msgs.push(chalk`    {green n/a}\n`);

      // Drain messages into custom handler or warnings/errors.
      const report = msgs.join("\n    ");
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