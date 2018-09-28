import { reporter } from "io-ts-reporters";
import { normalize, relative } from "path";
import { IModule } from "../interfaces/modules";
import {
  IWebpackStats,
  IWebpackStatsAsset,
  IWebpackStatsAssets,
  IWebpackStatsChunk,
  IWebpackStatsModule,
  IWebpackStatsModuleModules,
  IWebpackStatsModules,
  IWebpackStatsModuleSource,
  IWebpackStatsModuleSynthetic,
  RWebpackStats,
  RWebpackStatsModuleModules,
  RWebpackStatsModuleSource,
  RWebpackStatsModuleSynthetic,
} from "../interfaces/webpack-stats";
import { toPosixPath } from "../util/files";
import { sort } from "../util/strings";

export interface IActionConstructor {
  stats: IWebpackStats;
}

interface IModulesByAsset {
  [asset: string]: {
    asset: IWebpackStatsAsset;
    mods: IModule[];
  };
}

// Helper structure
interface IModulesSetByAsset {
  [asset: string]: {
    asset: IWebpackStatsAsset;
    mods: Set<IModule>
  };
}

// Note: Should only use with strings from `toPosixName()`.
const NM_RE = /(^|\/)(node_modules|\~)(\/|$)/g;
export const nodeModulesParts = (name: string) => toPosixPath(name).split(NM_RE);

// True if name is part of a `node_modules` path.
export const _isNodeModules = (name: string): boolean => nodeModulesParts(name).length > 1;

// Convert a `node_modules` name to a base name.
//
// Normalizations:
// - Remove starting path if `./`
// - Switch Windows paths to Mac/Unix style.
// - Non-`node_modules` sources (e.g. "your" sources) return `null`.
export const _getBaseName = (name: string): string | null => {
  // Not in `node_modules`.
  if (!_isNodeModules(name)) {
    return null;
  }

  // Slice to just after last occurrence of node_modules.
  const parts = nodeModulesParts(name);
  const lastName = parts[parts.length - 1];

  // Normalize out the rest of the string.
  let candidate = normalize(relative(".", lastName));

  // Short-circuit on empty string / current path.
  if (candidate === ".") {
    return "";
  }

  // Special case -- synthetic modules can end up with trailing `/` because
  // of a regular expression. Preserve this.
  //
  // E.g., `/PATH/TO/node_modules/moment/locale sync /es/`
  //
  // **Note**: The rest of this tranform _should_ be safe for synthetic regexps,
  // but we can always revisit.
  if (name[name.length - 1] === "/") {
    candidate += "/";
  }

  return toPosixPath(candidate);
};

export abstract class Action {
  public stats: IWebpackStats;
  private _data?: object;
  private _modules?: IModule[];
  private _assets?: IModulesByAsset;
  private _template?: ITemplate;

  constructor({ stats }: IActionConstructor) {
    this.stats = stats;
  }

  public validate(): Promise<IAction> {
    return Promise.resolve()
      .then(() => {
        // Validate the stats object.
        const result = RWebpackStats.decode(this.stats);
        if (result.isLeft()) {
          const errs = reporter(result);
          throw new Error(`Invalid webpack stats object. (Errors: ${errs.join(", ")})`);
        }
      })
      .then(() => this);
  }

  // Create the internal data object for this action.
  //
  // This is a memoizing wrapper on the abstract internal method actions
  // must implement.
  public getData(): Promise<object> {
    return Promise.resolve()
      .then(() => this._data || this._getData())
      .then((data) => this._data = data);
  }

  // Flat array of webpack source modules only. (Memoized)
  public get modules(): IModule[] {
    return this._modules = this._modules || this.getSourceMods(this.stats.modules);
  }

  protected getSourceMods(
    mods: IWebpackStatsModules,
    parentChunks?: IWebpackStatsChunk[],
  ): IModule[] {
    return mods
      // Recursively flatten to list of source modules.
      .reduce(
        (list: IModule[], mod: IWebpackStatsModule) => {
          // Add in any parent chunks and ensure unique array.
          const chunks = Array.from(new Set(mod.chunks.concat(parentChunks || [])));

          if (RWebpackStatsModuleSource.decode(mod).isRight()) {
            // Easy case -- a normal source code module.
            const srcMod = mod as IWebpackStatsModuleSource;
            const { identifier, size, source } = srcMod;

            return list.concat([{
              baseName: _getBaseName(identifier),
              chunks,
              identifier,
              isNodeModules: _isNodeModules(identifier),
              isSynthetic: false,
              size,
              source,
            }]);
          } else if (RWebpackStatsModuleModules.decode(mod).isRight()) {
            // Recursive case -- more modules.
            const modsMod = mod as IWebpackStatsModuleModules;

            return list.concat(this.getSourceMods(modsMod.modules, chunks));
          } else if (RWebpackStatsModuleSynthetic.decode(mod).isRight()) {
            // Catch-all case -- a module without modules or source.
            const syntheticMod = mod as IWebpackStatsModuleSynthetic;
            const { identifier, size } = syntheticMod;

            return list.concat([{
              baseName: _getBaseName(identifier),
              chunks,
              identifier,
              isNodeModules: _isNodeModules(identifier),
              isSynthetic: true,
              size,
              source: null,
            }]);
          }

          throw new Error(`Cannot match to known module type: ${JSON.stringify(mod)}`);
        },
        [],
      )
      // Sort: via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare
      .sort((a, b) => a.identifier.localeCompare(b.identifier));
  }

  // Object of source modules grouped by asset. (Memoized)
  public get assets(): IModulesByAsset {
    return this._assets = this._assets || this.getSourceAssets(this.stats.assets);
  }

  protected getSourceAssets(assets: IWebpackStatsAssets): IModulesByAsset {
    // Helper: LUT from chunk to asset name.
    const chunksToAssets: { [chunk: string]: Set<string> } = {};
    // Actual working data object.
    const modulesSetByAsset: IModulesSetByAsset = {};

    // Limit assets to possible JS files.
    const jsAssets = assets.filter((asset) => /\.(m|)js$/.test(asset.name));

    // Iterate assets and begin populating structures.
    jsAssets.forEach((asset) => {
      modulesSetByAsset[asset.name] = {
        asset,
        mods: new Set(),
      };

      asset.chunks.forEach((chunk) => {
        chunk = chunk.toString(); // force to string.
        chunksToAssets[chunk] = chunksToAssets[chunk] || new Set();

        // Add unique assets.
        chunksToAssets[chunk].add(asset.name);
      });
    });

    // Iterate modules and attach as appropriate.
    this.modules.forEach((mod) => {
      mod.chunks.forEach((chunk) => {
        chunk = chunk.toString(); // force to string.
        (chunksToAssets[chunk] || []).forEach((assetName) => {
          const assetObj = modulesSetByAsset[assetName];
          if (assetObj) {
            assetObj.mods.add(mod);
          }
        });
      });
    });

    // Convert to final form
    return Object.keys(modulesSetByAsset)
      .sort(sort)
      .reduce((memo: IModulesByAsset, assetName) => {
        const assetSetObj = modulesSetByAsset[assetName];
        memo[assetName] = {
          asset: assetSetObj.asset,
          mods: Array.from(assetSetObj.mods),
        };
        return memo;
      }, {});
  }

  public get template(): ITemplate {
    this._template = this._template || this._createTemplate();
    return this._template;
  }

  protected abstract _getData(): Promise<object>;
  protected abstract _createTemplate(): ITemplate;
}

// Simple alias for now (may extend later as real interface).
export type IAction = Action;

interface ITemplateConstructor {
  action: IAction;
}

export enum TemplateFormat {
  json = "json",
  text = "text",
  tsv = "tsv",
}

export interface ITemplate {
  json(): Promise<string>;
  text(): Promise<string>;
  tsv(): Promise<string>;
  plugin(): Promise<string>;
  render(format: TemplateFormat): Promise<string>;
}

export abstract class Template implements ITemplate {
  protected action: IAction;

  constructor({ action }: ITemplateConstructor) {
    this.action = action;
  }

  public json(): Promise<string> {
    return this.action.getData().then((data) => JSON.stringify(data, null, 2));
  }

  public abstract text(): Promise<string>;
  public abstract tsv(): Promise<string>;

  // For use by the inspectpack plugin.
  public plugin(): Promise<string> {
    return this.text();
  }

  public render(format: TemplateFormat): Promise<string> {
    return this[format]();
  }

  protected trim(str: string, num: number) {
    return str
      .trimRight() // trailing space.
      .replace(/^[ ]*\s*/m, "") // First line, if empty.
      .replace(new RegExp(`^[ ]{${num}}`, "gm"), "");
  }
}
