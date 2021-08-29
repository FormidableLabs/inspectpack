import * as chalk from "chalk";
import * as semver from "semver";
import semverCompare = require("semver-compare");
import { actions } from "../lib";
import { _packageName, IVersionsData, IVersionsDataAssets, IVersionsPackages, IVersionAction } from "../lib/actions/versions";
import { numF, sort } from "../lib/util/strings";
import {
  IDependencies,
} from "../lib/util/dependencies";
import { versionpkgNamePath, ICompiler, ICompilation } from "./common"

// ----------------------------------------------------------------------------
// Interfaces
// ----------------------------------------------------------------------------

interface IAllowedVersions{
  [key: string]: string,
}

interface IVersionsCheckPluginConstructor {
  verbose?: boolean;
  emitErrors?: boolean;
  emitHandler?: (report: string) => {};
  allowedVersions?: IAllowedVersions;
  ignoredPackages?: (string | RegExp)[];
}

interface IDependencyMap {
  [key: string]: IDependencyMapEntry
}

interface IDependencyMapEntry {
  [key: string]: Set<string>
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
// return version messages of pkgName
const getVersionsInfo = (assetName: string, pkgName:string, assets: IVersionsDataAssets, deduped: boolean = false): string[] => {
  const versionsInfo: string[] = [];
  Object.keys(assets[assetName].packages[pkgName])
  .sort(semverCompare)
  .forEach((version) => {
    versionsInfo.push(chalk`  {gray * ${version} ${deduped ? '(bundled)' : ''}}`);
    Object.keys(assets[assetName].packages[pkgName][version])
      .sort(sort)
      .forEach((filePath) => {
        const {
          skews,
          modules,
        } = assets[assetName].packages[pkgName][version][filePath];

        versionsInfo.push(chalk`    * Num deps: ${numF(skews.length)}, files: ${numF(modules.length)}`);
        skews.map((pkgParts) => pkgParts.map((part, i) => Object.assign({}, part, {
            name: chalk[i < pkgParts.length - 1 ? "gray" : "cyan"](part.name),
          })))
          .map(versionpkgNamePath)
          .sort(sort)
          .forEach((pkgStr) => versionsInfo.push(`      * ${pkgStr}`));
      });
    });
  return versionsInfo;
}

// return version messages of pkgName that has duplicate input
const reportDedupVersionInfo = (assetName: string, pkgName:string, assets: IVersionsDataAssets, yarnlockData: any): string[] => {
  const versionsInfo: string[] = [];
  versionsInfo.push(...getVersionsInfo(assetName, pkgName, assets, true));

  // There should only be 1 version of the package
  const versionArray = Object.keys(assets[assetName].packages[pkgName]);
  const dedupedVersion = versionArray.length === 1 ? versionArray[0]:'';
  Object.keys(yarnlockData).forEach((version) => {
    if (version != dedupedVersion) {
      versionsInfo.push(chalk`  {gray * ${version} (not bundled)}`);
      yarnlockData[version].forEach((path: string) => {
        versionsInfo.push(chalk`      * ${path}`);
      });
    }
  });

  return versionsInfo;
}

// takes a dependency tree and flatten it into a map
function getDependencyMap(tree: IDependencies, data: IDependencyMap, dependencyLink: string) {
  if (tree.dependencies) {
    for (let i = 0; i < tree.dependencies.length; i++) {
      const key = tree.dependencies[i].name;
      const dependencyData = tree.dependencies[i];
      data[key] = data[key] || {};
      data[key][dependencyData.version] = data[key][dependencyData.version] || new Set();
      data[key][dependencyData.version].add(chalk `${dependencyLink} -> {gray ${key}}@${dependencyData.version}`);
      getDependencyMap(dependencyData, data, chalk `${dependencyLink} -> {gray ${key}}@${dependencyData.version}`);
    }
  }
}

// return names of all dependency that has multiple versions in the dependency map
function findDupsFromDependencyMap(dependencyMap: IDependencyMap): (string[]) {
  const depNames: string[] = Object.keys(dependencyMap).sort();
  const dupDependencies: string[] = depNames.filter((depName) => {
    return Object.keys(dependencyMap[depName]).length > 1;
  });
  return dupDependencies;
}

// returns true if a package version does not match the allowedVersions specified, otherwise, return false
const isAllowedVersionViolated = (allowedVersions:IAllowedVersions, pkgName: string, packages: IVersionsPackages): boolean => {
  if (Object.keys(allowedVersions).includes(pkgName)) {
    const versions = Object.keys(packages[pkgName]);
    const specifier = allowedVersions[pkgName];
    return !(specifier === '*' || versions.every(version => semver.satisfies(version, specifier)));
  }
  return false;
}

// analyzes the asset package data & lock file dependency tree, returns:
// 1. any packages violating version restraints
// 2. verbose output contains version info of each package.
/* sample verbose output:
  Duplicated packages
  ## `chunk.6d75141a1b34dadb998a.js`
  * packageY
    * 0.2.4
      * Num deps: 1, files: 1
        * repoName@0.0.0 -> packageX@0.4.0 -> packageY@0.2.4
    * 0.3.0
      * Num deps: 2, files: 1
        * repoName@0.0.0 -> packageZ@1.2.0 -> packageY@0.3.0
  Deduplicated packages
  ## `chunk.6d75141a1b34dadb998a.js`
  * @packageD
    * 1.0.3 (bundled)
      * Num deps: 1, files: 2
        * repoName@0.0.0 -> packageD@1.0.3
    * 0.3.0 (not bundled)
        * repoName@0.0.0 -> packageCd@3.0.3 -> packageD@0.3.0
  Single version packages
  ## `chunk.6d75141a1b34dadb998a.js`
  * @packageA
    * 2.0.1
      * Num deps: 1, files: 5
        * repoName@1.0.0 -> packageA@2.0.1
*/
function analyzePackageVersions(assets: IVersionsDataAssets, allowedVersionsMap: IAllowedVersions, depTree: (IDependencies | null)[]): {
  verboseOutput: string[];
  versionViolations: string[];
} {
  const verboseOutput: string[] = [];
  const dupPkgMsgs: string[] = [];
  const dedupedPkgMsgs: string[] = [];
  const singlePkgMsgs: string[] = [];
  const versionViolations: string[] = [];
  const dependencyMap: IDependencyMap = {};

  depTree.forEach((dependency) => {
    if (dependency !== null ){
      getDependencyMap(dependency, dependencyMap, chalk `{gray ${dependency.name}}@${dependency.version}`);
    }
  });
  const dupDependencies = findDupsFromDependencyMap(dependencyMap);

  Object.keys(assets)
  .filter((assetName) => Object.keys(assets[assetName].packages).length)
  .forEach((assetName) => {
    // For each asset, report duplicated packages, deduplicated packages and single version packages
    // deduplicate packages are packages that has multiple version for input, while one version gets deduped and bundled in the assets
    const dupPkgForAsset: string[] = [];
    const dedupedPkgForAsset: string[] = [];
    const singlePkgForAsset: string[] = [];

    Object.keys(assets[assetName].packages)
    .sort(sort)
    .forEach((pkgName) => {
      let versionInfo;
      // if pkgName has multiple versions
      if (Object.keys(assets[assetName].packages[pkgName]).length > 1) {
        versionInfo = getVersionsInfo(assetName, pkgName, assets);
        dupPkgForAsset.push(chalk`* {cyan ${pkgName}}`, ...versionInfo);
      }
      // if pkgName a single version, but has multiple versions in the lock file
      else if (dupDependencies.some(depName => depName === pkgName)) {
        versionInfo = reportDedupVersionInfo(assetName, pkgName, assets, dependencyMap[pkgName]);
        dedupedPkgForAsset.push(chalk`* {cyan ${pkgName}}`, ...versionInfo);
      }
      // pkgName has a single version
      else {
        versionInfo = getVersionsInfo(assetName, pkgName, assets);
        singlePkgForAsset.push(chalk`* {cyan ${pkgName}}`, ...versionInfo);
      }

      // validate allowedVersions
      if (isAllowedVersionViolated(allowedVersionsMap, pkgName, assets[assetName].packages)) {
        const specifier = allowedVersionsMap[pkgName];
        versionViolations.push(chalk `{bold.red ${pkgName} - allowed semver: ${specifier}}`)
        versionViolations.push(...versionInfo);
      }
    });

    if (dupPkgForAsset.length > 1) {
      dupPkgMsgs.push(chalk `{gray ## \`${assetName}\`}`, ...dupPkgForAsset, '');
    }
    if (dedupedPkgForAsset.length > 1) {
      dedupedPkgMsgs.push(chalk `{gray ## \`${assetName}\`}`, ...dedupedPkgForAsset, '');
    }
    if (singlePkgForAsset.length > 1) {
      singlePkgMsgs.push(chalk `{gray ## \`${assetName}\`}`, ...singlePkgForAsset, '');
    }
  });

  // summarize everything
  verboseOutput.push(chalk`{bold.underline Versions info}\n`);
  verboseOutput.push(chalk`{underline Single version packages}`);
  (singlePkgMsgs.length > 1) ? verboseOutput.push(...singlePkgMsgs) : verboseOutput.push(chalk`    {green n/a}\n`);
  if (dedupedPkgMsgs.length > 0) {
    verboseOutput.push(chalk`{underline Deduplicated packages}`);
    verboseOutput.push(...dedupedPkgMsgs);
  }
  verboseOutput.push(chalk`{underline Duplicate version packages}`);
  (dupPkgMsgs.length > 1) ? verboseOutput.push(...dupPkgMsgs) : verboseOutput.push(chalk`    {green n/a}\n`);

  return { verboseOutput, versionViolations };
}

// ----------------------------------------------------------------------------
// Plugin
// ----------------------------------------------------------------------------
export class VersionCheckPlugin {
  private opts: IVersionsCheckPluginConstructor;

  constructor({verbose, emitErrors, emitHandler, ignoredPackages, allowedVersions}: IVersionsCheckPluginConstructor = {}) {
    this.opts = {
      emitErrors: emitErrors === true, // default `false`
      emitHandler: typeof emitHandler === "function" ? emitHandler : undefined,
      ignoredPackages: Array.isArray(ignoredPackages) ? ignoredPackages : undefined,
      verbose: verbose === true, // default `false`
      allowedVersions: allowedVersions,
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

    const { emitErrors, emitHandler, ignoredPackages, verbose, allowedVersions } = this.opts;

    // Stash messages for output to console (success) or compilation warnings
    // or errors arrays on duplicates found.
    // TODO: how to not require or empty object/string??
    const allowedVersionsMap = allowedVersions || {};
    let versionAction: IVersionAction;

    return Promise.resolve()
      .then(() => actions("versions", { stats, ignoredPackages, duplicatesOnly: false }))
      .then((a) => {
        versionAction = a as IVersionAction;
        return Promise.all([
          versionAction.getData() as Promise<IVersionsData>,
          versionAction.allDeps
        ]);
      })
      .then((datas) => {
        const [ versionsData, allDeps ] = datas;
        const { verboseOutput, versionViolations } = analyzePackageVersions(versionsData.assets, allowedVersionsMap, allDeps);
        let report = [];
        if (versionViolations.length > 0) {
          report.push(chalk`{bold.underline Versions violations}`);
          report.push('Inspectpack versionsPlugin found the following packages violating the allowedVersions specified:\n');
          report.push(...versionViolations);
        }

        if (verbose) {
          report.unshift(...verboseOutput)
        }
        const output = report.join("\n    ");
        // Drain messages into custom handler or warnings/errors.
        if (emitHandler) {
          emitHandler(output);
        } else {
          if (emitErrors && versionViolations.length > 0 ) {
            errors.push(new Error(output));
          } else {
            warnings.push(new Error(output));
          }
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