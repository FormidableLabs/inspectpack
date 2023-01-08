import * as colors from "picocolors";

import { IActionModule } from "../interfaces/modules";
import { numF, sort } from "../util/strings";
import {
  Action,
  IAction,
  IActionConstructor,
  ITemplate,
  Template,
} from "./base";

interface ISizesAssets {
  [asset: string]: {
    meta: {
      full: number;
    };
    files: IActionModule[];
  };
}

export interface ISizesData {
  meta: {
    full: number;
  };
  assets: ISizesAssets;
}

class Sizes extends Action {
  protected _getData(): Promise<ISizesData> {
    return Promise.resolve()
      .then(() => {
        const { assets } = this;
        const assetNames = Object.keys(assets).sort(sort);

        // Iterate assets.
        const assetSizes: ISizesAssets = {};
        assetNames.forEach((name) => {
          assetSizes[name] = {
            files: assets[name].mods.map((mod) => ({
              baseName: mod.baseName,
              fileName: mod.identifier,
              size: {
                full: mod.size,
              },
            })),
            meta: {
              full: assets[name].asset.size,
            },
          };
        });

        return {
          assets: assetSizes,
          meta: {
            // Size of all assets together.
            //
            // **Note**: Could add up to more than total number of individual
            // modules because of inclusion in multiple assets.
            full: assetNames.reduce((m, n) => m + assets[n].asset.size, 0),
          },
        };
      });
  }

  protected _createTemplate(): ITemplate {
    return new SizesTemplate({ action: this });
  }
}

class SizesTemplate extends Template {
  public text(): Promise<string> {
    return Promise.resolve()
      .then(() => this.action.getData() as Promise<ISizesData>)
      .then(({ meta, assets }) => {
        const files = (mods: IActionModule[]) => mods
          .map((obj) => this.trim(`
            * ${colors.gray(obj.fileName)}
              * Size: ${numF(obj.size.full)}
          `, 12))
          .join("\n");

        const assetSizes = Object.keys(assets)
          .map((name) => this.trim(`
            ${colors.gray(`## \`${name}\``)}
            * Bytes: ${numF(assets[name].meta.full)}
            ${files(assets[name].files)}
          `, 12))
          .join("\n\n");

        const report = this.trim(`
          ${colors.cyan("inspectpack --action=sizes")}
          ${colors.gray("==========================")}

          ${colors.gray("## Summary")}
          * Bytes: ${numF(meta.full)}

          ${assetSizes}
        `, 10);

        return report;
      });
  }

  public tsv(): Promise<string> {
    return Promise.resolve()
      .then(() => this.action.getData() as Promise<ISizesData>)
      .then(({ assets }) => ["Asset\tFull Name\tShort Name\tSize"]
        .concat(Object.keys(assets)
          // Get items
          .map((name) => assets[name].files
            .map((obj) => [
              name,
              obj.fileName,
              obj.baseName === null ? "(source)" : obj.baseName,
              obj.size.full,
            ].join("\t")),
          )
          // Flatten
          .reduce((m, a) => m.concat(a), [])
        .join("\n"))
      .join("\n"));
  }
}

export const create = (opts: IActionConstructor): IAction => {
  return new Sizes(opts);
};
