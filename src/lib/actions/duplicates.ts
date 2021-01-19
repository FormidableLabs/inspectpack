import * as chalk from "chalk";

import { IActionModule, IModule, SYNTHETIC_SOURCE_TOKEN } from "../interfaces/modules";
import { numF, sort } from "../util/strings";
import {
  Action,
  IAction,
  IActionConstructor,
  ITemplate,
  Template,
} from "./base";

interface IDuplicatesSummary {
  // Unique file paths that have 2+ sources.
  // E.g., number of source versions of `lodash/foo.js`.
  extraFiles: {
    num: number,
  };
  // Within a file path, number of identical.
  // E.g., number of instances of `lodash/foo.js` (identical source or not).
  extraSources: {
    num: number,
    bytes: number,
  };
}

interface IDuplicatesSource {
  meta: IDuplicatesSummary;
  modules: IActionModule[];
}

export interface IDuplicatesFiles {
  // File base name
  [baseName: string]: {
    meta: IDuplicatesSummary,
    // Grouped and sorted by `source` code string, which is then omitted
    // for final array.
    sources: IDuplicatesSource[],
  };
}

interface IDuplicatesDataAssets {
  [asset: string]: {
    meta: IDuplicatesSummary;
    files: IDuplicatesFiles;
  },
}

export interface IDuplicatesData {
  meta: IDuplicatesSummary;
  assets: IDuplicatesDataAssets;
}

interface IModulesByBaseNameBySource {
  [baseName: string]: {
    [source: string]: IModule[],
  };
}

/**
 * Create map of `basename` -> `source` -> `IModule`.
 *
 * @param mods {IModule[]} array of module objects.
 * @returns {IModulesByBaseNameBySource} map
 */
const modulesByBaseNameBySource = (mods: IModule[]): IModulesByBaseNameBySource => {
  // Mutable, empty object to group base names with.
  const modsMap: IModulesByBaseNameBySource = {};

  // Iterate node_modules modules and add to keyed object.
  mods.forEach((mod) => {
    if (!mod.isNodeModules) { return; }

    // First level -- base name
    if (mod.baseName === null) { // Programming error.
      throw new Error(`Encountered non-node_modules null baseName: ${JSON.stringify(mod)}`);
    }
    const base = modsMap[mod.baseName] = modsMap[mod.baseName] || {};

    // Second level -- source.
    // Use token placeholder if synthetic.
    const source = mod.isSynthetic ? SYNTHETIC_SOURCE_TOKEN : mod.source;
    if (source === null) { // Programming error.
      throw new Error(`Encountered null source in non-synthetic module: ${JSON.stringify(mod)}`);
    }
    base[source] = (base[source] || []).concat(mod);
  });

  // Now, remove any single item keys (no duplicates).
  Object.keys(modsMap).forEach((baseName) => {
    const keys = Object.keys(modsMap[baseName]);
    if (keys.length === 1 && modsMap[baseName][keys[0]].length === 1) {
      delete modsMap[baseName];
    }
  });

  return modsMap;
};

// Helper
const createEmptySummary = (): IDuplicatesSummary => ({
  extraFiles: {
    num: 0,
  },
  extraSources: {
    bytes: 0,
    num: 0,
  },
});

class Duplicates extends Action {
  public shouldBail(): Promise<boolean> {
    return this.getData().then((data: object) =>
      (data as IDuplicatesData).meta.extraFiles.num !== 0
    );
  }

  protected _getData(): Promise<IDuplicatesData> {
    return Promise.resolve()
      .then(() => {
        const { assets } = this;
        const assetNames = Object.keys(assets).sort(sort);

        // Get asset duplicates
        const assetDups: IDuplicatesDataAssets = {};
        assetNames.forEach((name) => {
          const modsMap = modulesByBaseNameBySource(assets[name].mods);

          const files: IDuplicatesFiles = {};
          Object.keys(modsMap).forEach((baseName) => {
            files[baseName] = {
              meta: createEmptySummary(),
              sources: Object
                .keys(modsMap[baseName])
                .sort(sort)
                .map((source) => ({
                  meta: createEmptySummary(),
                  modules: modsMap[baseName][source].map((mod) => ({
                    baseName: mod.baseName,
                    fileName: mod.identifier,
                    size: {
                      full: mod.size,
                    },
                  })),
                })),
            };
          });

          assetDups[name] = {
            files,
            meta: createEmptySummary(),
          };
        });

        // Create real data object.
        // Start without any summaries. Just raw object structure.
        const data: IDuplicatesData = {
          assets: assetDups,
          meta: createEmptySummary(),
        };

        assetNames.forEach((name) => {
          const assetDup = data.assets[name];
          Object.keys(assetDup.files).forEach((baseName) => {
            const { sources, meta } = assetDup.files[baseName];

            sources.forEach((sourceGroup) => {
              // Then, replace per source group meta
              sourceGroup.meta = {
                extraFiles: {
                  num: 1,
                },
                extraSources: {
                  bytes: sourceGroup.modules.reduce((bytes, mod) => bytes + mod.size.full, 0),
                  num: sourceGroup.modules.length,
                },
              };

              // Then, update per file group meta
              meta.extraFiles.num += 1;
              meta.extraSources.bytes += sourceGroup.meta.extraSources.bytes;
              meta.extraSources.num += sourceGroup.meta.extraSources.num;

              // Then, update asset meta
              assetDup.meta.extraFiles.num += 1;
              assetDup.meta.extraSources.bytes += sourceGroup.meta.extraSources.bytes;
              assetDup.meta.extraSources.num += sourceGroup.meta.extraSources.num;

              // Then, update total meta
              data.meta.extraFiles.num += 1;
              data.meta.extraSources.bytes += sourceGroup.meta.extraSources.bytes;
              data.meta.extraSources.num += sourceGroup.meta.extraSources.num;
            });
          });
        });

        return data;
      });
    }

  protected _createTemplate(): ITemplate {
    return new DuplicatesTemplate({ action: this });
  }
}

class DuplicatesTemplate extends Template {
  public text(): Promise<string> {
    return Promise.resolve()
      .then(() => this.action.getData() as Promise<IDuplicatesData>)
      .then(({ meta, assets }) => {
        const dupAsset = (name: string) => chalk`{gray ## \`${name}\`}`;
        const dupFiles = (name: string) => Object.keys(assets[name].files)
          .map((baseName) => {
            const { files } = assets[name];
            const base = files[baseName];

            const inlineMeta = (obj: IDuplicatesSummary) =>
              `Files ${numF(obj.extraFiles.num)}, ` +
              `Sources ${numF(obj.extraSources.num)}, ` +
              `Bytes ${numF(obj.extraSources.bytes)}`;

            const sources = files[baseName].sources
              .map((sourceGroup, i) => this.trim(`
                ${i}. (${inlineMeta(sourceGroup.meta)})
                  ${sourceGroup.modules
                    .map((mod) => `(${mod.size.full}) ${chalk.gray(mod.fileName)}`)
                    .join("\n    ")}
              `, 14))
              .join("\n  ");

            return this.trim(chalk`
              * {green ${baseName}}
                * Meta: ${inlineMeta(base.meta)}
                ${sources}
            `, 14);
          })
          .join("\n");
        const duplicates = (name: string) => `${dupAsset(name)}\n${dupFiles(name)}\n`;

        const report = this.trim(chalk`
          {cyan inspectpack --action=duplicates}
          {gray ===============================}

          {gray ## Summary}
          * Extra Files (unique):         ${numF(meta.extraFiles.num)}
          * Extra Sources (non-unique):   ${numF(meta.extraSources.num)}
          * Extra Bytes (non-unique):     ${numF(meta.extraSources.bytes)}

          ${Object.keys(assets)
            .filter((name) => Object.keys(assets[name].files).length)
            .map(duplicates).join("\n")}
        `, 10);

        return report;
      });
  }

  public tsv(): Promise<string> {
    return Promise.resolve()
      .then(() => this.action.getData() as Promise<IDuplicatesData>)
      .then(({ assets }) => ["Asset\tFull Name\tShort Name\tGroup Index\tSize"]
        .concat(Object.keys(assets)
          .filter((name) => Object.keys(assets[name].files).length)
          .map((name) => Object.keys(assets[name].files)
            .map((baseName) => assets[name].files[baseName].sources
              .map((sourceGroup, i) => sourceGroup.modules
                .map((mod) => [
                    name,
                    mod.fileName,
                    mod.baseName,
                    i,
                    mod.size.full,
                  ].join("\t"))
                .join("\n"))
              .join("\n"))
            .join("\n"))
          .join("\n"))
        .join("\n"));
  }
}

export const create = (opts: IActionConstructor): IAction => {
  return new Duplicates(opts);
};
