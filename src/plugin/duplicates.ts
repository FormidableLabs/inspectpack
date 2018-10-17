import chalk from "chalk";
import { actions } from "../lib";
import { IDuplicatesData, IDuplicatesFiles } from "../lib/actions/duplicates";
import { IVersionsData } from "../lib/actions/versions";
import { IWebpackStats } from "../lib/interfaces/webpack-stats";
import { INpmPackageBase } from "../lib/util/dependencies";
import { numF, sort } from "../lib/util/strings";

const { log } = console;

const identical = (val: string) => chalk`{bold.magenta ${val}}`;
const similar = (val: string) => chalk`{bold.blue ${val}}`;
const warning = (val: string) => chalk`{bold.yellow ${val}}`;
const error = (val: string) => chalk`{bold.red ${val}}`;

// Simple interfaces for webpack work.
// See, e.g. https://github.com/TypeStrong/ts-loader/blob/master/src/interfaces.ts
interface ICompiler {
  hooks: any;
  plugin: (name: string, callback: () => void) => void;
}

interface IStats {
  toJson: () => IWebpackStats;
}

interface IDuplicatesByFileModule {
  baseName: string;
  bytes: number;
  isIdentical: boolean;
}

interface IDuplicatesByFile {
  [fileName: string]: IDuplicatesByFileModule;
}

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
      actions("versions", { stats }).then((a) => a.getData() as Promise<IVersionsData>),
    ])
      .then((datas) => {
        const [dupData, pkgData] = datas;
        const header = chalk`{bold.underline Duplicate Sources / Packages}`;

        // No duplicates
        if (dupData.meta.extraFiles.num === 0) {
          log(chalk`\n${header} - {green No duplicates found. 🚀}\n`);
          return;
        }

        // Have duplicates. Report summary.
        // TODO(RYAN): Re-color based on "green" vs "warning" vs "error"?
        // tslint:disable max-line-length
        log(chalk`
${header} - ${warning("Duplicates found! ⚠️")}

* {yellow.bold.underline Duplicates}: Found a total of ${numF(dupData.meta.extraFiles.num)} ${similar("similar")} files across ${numF(dupData.meta.extraSources.num)} code sources (both ${identical("identical")} + similiar) accounting for ${numF(dupData.meta.extraSources.bytes)} bundled bytes.
* {yellow.bold.underline Packages}: Found a total of ${numF(pkgData.meta.skewedPackages.num)} packages with ${numF(pkgData.meta.skewedVersions.num)} {underline resolved}, ${numF(pkgData.meta.installedPackages.num)} {underline installed}, and ${numF(pkgData.meta.dependedPackages.num)} {underline depended} versions.
`);
        // tslint:enable max-line-length

        Object.keys(pkgData.assets).forEach((dupAssetName) => {
          const pkgAsset = pkgData.assets[dupAssetName];
          // TODO(RYAN): Don't output asset if only 1 asset. (???)
          log(chalk`{gray ##} {yellow ${dupAssetName}}`);

          let dupsByFile: IDuplicatesByFile = {};
          if (dupData.assets[dupAssetName] &&
            dupData.assets[dupAssetName].files) {
            dupsByFile = getDuplicatesByFile(dupData.assets[dupAssetName].files);
          }

          const { packages } = pkgAsset;
          Object.keys(packages).forEach((pkgName) => {
            log(chalk`{cyan ${pkgName}}:`);

            Object.keys(packages[pkgName]).forEach((version) => {
              const installs = Object.keys(packages[pkgName][version]).map((installed) => {
                const skews = packages[pkgName][version][installed].skews
                  .map((pkgParts) => pkgParts.map((part, i) => ({
                    ...part,
                    name: chalk[i < pkgParts.length - 1 ? "gray" : "cyan"](part.name),
                  })))
                  .map(pkgNamePath)
                  .sort(sort)
                  .join("\n        ");

                const duplicates = packages[pkgName][version][installed].modules
                  .map((mod) => dupsByFile[mod.fileName])
                  .filter(Boolean)
                  .map((mod) => {
                    const note = mod.isIdentical ? identical("I") : similar("S");
                    return chalk`{gray ${mod.baseName}} (${note}, ${numF(mod.bytes)})`;
                  })
                  .join("\n        ");

                return chalk`    {gray ${shortPath(installed)}}
      {white * Dependency graph}
        ${skews}
      {white * Duplicates}
        ${duplicates}
`;
              });

              // Delay output to gather aggregates.
              // TODO(RYAN): Add aggregates conditionally for verbose: false???
              log(chalk`  {green ${version}}`);
              installs.forEach((val) => log(val));
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
        //   //dup: dupData.meta,
        //   pkg: pkgData.meta,
        //   // dupAssets: dupData.assets,
        //   //pkgAssets: pkgData.assets,
        // }, null, 2));

        // TODO: Add meta level "found X foo's across Y bar's..." summary.
      });
  }
}
