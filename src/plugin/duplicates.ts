import { actions } from "../lib";
import { IVersionsData, _packageName } from "../lib/actions/versions";
import { IWebpackStats } from "../lib/interfaces/webpack-stats";
import { IDuplicatesData } from "../lib/actions/duplicates";
import chalk from "chalk";
import { sort, numF } from "../lib/util/strings";
import { INpmPackageBase } from "../lib/util/dependencies";

const { log } = console;

const NOTE_IDENTICAL = chalk`{bold.red I}`;
const NOTE_SIMILAR = chalk`{bold.yellow S}`;

// Simple interfaces for webpack work.
// See, e.g. https://github.com/TypeStrong/ts-loader/blob/master/src/interfaces.ts
interface ICompiler {
  hooks: any;
  plugin: (name: string, callback: () => void) => void;
}

interface IStats {
  toJson: () => IWebpackStats;
}

// `~/different-foo/~/foo`
const shortPath = (filePath: string) => filePath.replace(/node_modules/g, "~");

// `duplicates-cjs@1.2.3 -> different-foo@1.1.1 -> foo@3.3.3`
const pkgNamePath = (pkgParts: INpmPackageBase[]) => pkgParts.reduce(
  (m, part) => `${m}${m ? " -> " : ""}${part.name}@${part.version}`,
  "",
);

// TODO(RYAN): HERE --  Need to re-organize by **FULL INSTALLED FILE PATH** as lookup key.
// TODO: Need to **ALSO** capture "identical" vs. "similar" (use proper naming.)
//       As you go through structure, can see up:
//       1. `extraSources.num > 1` means "identical match"
//       2. `extraSources.bytes` "size of this file."
// TODO: Figure out capture "wasted bytes maybe???" (total bytes - min bytes).
// Organize duplicates by package name.
const getDuplicatesByFile = (files) => {
  const dupsByFile = {};

  Object.keys(files).forEach((fileName) => {
    files[fileName].sources.forEach((source) => {
      source.modules.forEach((mod) => {
        dupsByFile[mod.fileName] = {
          baseName: mod.baseName,
          isIdentical: source.meta.extraSources.num > 1,
          bytes: mod.size.full
        };
      });
    });
  });

  return dupsByFile;
};

export class DuplicatesPlugin {
  public apply(compiler: ICompiler) {
    if (compiler.hooks) {
      // Webpack4 integration
      compiler.hooks.done.tap("inspectpack-duplicates-plugin", this.analyze.bind(this));
    } else {
      // Webpack1-3 integration
      compiler.plugin("done", this.analyze.bind(this));
    }
  }

  public analyze(statsObj: IStats) {
    const stats = statsObj.toJson();

    Promise.all([
      actions("duplicates", { stats }).then((a) => a.getData() as Promise<IDuplicatesData>),
      actions("versions", { stats }).then((a) => a.getData() as Promise<IVersionsData>)
    ])
      .then((datas) => {
        const [dupData, pkgData] = datas;
        const header = "Duplicate Sources / Packages";

        // No duplicates
        if (dupData.meta.extraFiles.num === 0) {
          log(chalk`
{underline.bold.green ${header}}

{green No duplicates found. 🚀}
          `.trimRight())
          return;
        }

        // Have duplicates. Report summary.
        // TODO(RYAN): Re-color based on "green" vs "warning" vs "error"?
        log(chalk`
{underline.bold.yellow ${header}}

{bold.yellow Warning - Duplicates found! ⚠️}

TODO_SUMMARY
`);

        // TODO(RYAN): SUMMARY
        // - {bold Identical code sources} from the {bold same package}:
        //     - TODO: PICK A COLOR
        //     - TODO: NUMBER
        //     - TODO: WASTED_BYTES
        // - {bold Similar code files} from {bold different packages}:
        //     - TODO: PICK A COLOR
        //     - TODO: NUMBER
        //     - TODO: WASTED_BYTES
        // - {bold Identical code sources} from {bold different packages}:
        //     - TODO: PICK A COLOR
        //     - TODO: NUMBER
        //     - TODO: WASTED_BYTES

        Object.keys(pkgData.assets).forEach((dupAssetName) => {
          const pkgAsset = pkgData.assets[dupAssetName];
          // TODO(RYAN): Don't output asset if only 1 asset. (???)
          log(chalk`{gray ##} {yellow ${dupAssetName}}`);

          let dupsByFile = null;
          if (dupData.assets[dupAssetName] &&
            dupData.assets[dupAssetName].files) {
            dupsByFile = getDuplicatesByFile(dupData.assets[dupAssetName].files);
          }

          const { packages } = pkgAsset;
          Object.keys(packages).forEach((pkgName) => {
            log(chalk`{cyan ${pkgName}}:`);
            Object.keys(packages[pkgName]).forEach((version) => {
              log(chalk`  {green ${version}}`);
              Object.keys(packages[pkgName][version]).forEach((installed) => {
                const skews = packages[pkgName][version][installed].skews
                  .map((pkgParts) => pkgParts.map((part, i) => ({
                    ...part,
                    name: chalk[i < pkgParts.length - 1 ? "gray" : "cyan"](part.name),
                  })))
                  .map(pkgNamePath)
                  .sort(sort)
                  .join("\n        ")

                const duplicates = packages[pkgName][version][installed].modules
                  .map((mod) => dupsByFile ? dupsByFile[mod.fileName] : undefined)
                  .filter(Boolean)
                  .map((mod) => {
                    const note = mod.isIdentical ? NOTE_IDENTICAL : NOTE_SIMILAR;
                    return chalk`{gray ${mod.baseName}} (${note}, ${numF(mod.bytes)})`;
                  })
                  .join("\n        ");

                log(chalk`    {gray ${shortPath(installed)}}
      {white * Dependency graph}
        ${skews}
      {white * Duplicates}
        ${duplicates}
`);
              });
            });
          });
        });

        // From versions
        // - Number of files total at issue across packages.  (`files`)
        // - Number of packages with skews  (`skewedPackages`)
        // - Number of differing versions across all packages (`skewedVersions`)
        //
        // From duplicates
        // - Number of duplicated sources (`duplicateSources`)
        // console.log("TODO HERE DATA", JSON.stringify({
        //   dup: dupData.meta,
        //   pkg: pkgData.meta,
        //   dupAssets: dupData.assets,
        //   pkgAssets: pkgData.assets,
        // }, null, 2));

        // TODO: Add meta level "found X foo's across Y bar's..." summary.
      });
  }
}
