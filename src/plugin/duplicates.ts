import { actions } from "../lib";
import { IVersionsData } from "../lib/actions/versions";
import { IWebpackStats } from "../lib/interfaces/webpack-stats";
import { IDuplicatesData } from "../lib/actions/duplicates";
import chalk from "chalk";

// Simple interfaces for webpack work.
// See, e.g. https://github.com/TypeStrong/ts-loader/blob/master/src/interfaces.ts
interface ICompiler {
  hooks: any;
  plugin: (name: string, callback: () => void) => void;
}

interface IStats {
  toJson: () => IWebpackStats;
}

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
        const header = chalk`{underline.bold.cyan Duplicate Sources / Packages} {gray (Inspectpack)}`;

        // No duplicates
        if (dupData.meta.extraFiles.num === 0) {
          console.log(chalk`
${header}

{green No duplicates found.}
          `)
        }

        // TODO: Handle no duplicates / version skews.
        //
        // From versions
        // - Number of files total at issue across packages.  (`files`)
        // - Number of packages with skews  (`skewedPackages`)
        // - Number of differing versions across all packages (`skewedVersions`)
        //
        // From duplicates
        // - Number of duplicated sources (`duplicateSources`)
        console.log("TODO HERE META", JSON.stringify({
          dup: dupData.meta,
          pkg: pkgData.meta
        }, null, 2));

        return;

        Object.keys(data.assets).forEach((dupAssetName) => {
          const pkgAsset = data.assets[dupAssetName];
          console.log("TODO HERE ASSET", { dupAssetName, pkgAsset });

          const { packages } = pkgAsset;
          Object.keys(packages).forEach((pkgName) => {
            console.log("TODO HERE PACKAGE", JSON.stringify({
              pkgName,
              versions: packages[pkgName]
            }, null, 2));
          });
        });

        // TODO: Add meta level "found X foo's across Y bar's..." summary.

        // const { assets } = datas[0];
        // const { packages } = datas[1]

        // Object.keys(datas[0].assets).forEach((assetName) => {
        //   console.log(JSON.stringify({
        //     assetName,
        //     files: Object.keys(datas[0].assets[assetName].files).map(_packageName)
        //   }, null, 2));
        // });

        // // tslint:disable-next-line no-console
        // console.log(JSON.stringify(datas, null, 2));
      });
  }
}
