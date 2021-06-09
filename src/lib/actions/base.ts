import { isLeft, isRight } from "fp-ts/lib/Either";
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
  IWebpackStatsModuleOrphan,
  IWebpackStatsModuleSynthetic,
  RWebpackStats,
  RWebpackStatsModuleModules,
  RWebpackStatsModuleSource,
  RWebpackStatsModuleOrphan,
  RWebpackStatsModuleSynthetic,
} from "../interfaces/webpack-stats";
import { toPosixPath } from "../util/files";
import { sort } from "../util/strings";

export interface IActionConstructor {
  stats: IWebpackStats;
  ignoredPackages?: (string | RegExp)[];
  duplicatesOnly?: boolean;
}

export interface IModulesByAsset {
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

// Attempt to "unwind" webpack paths in `identifier` and `name` to remove
// prefixes and produce a normal, usable filepath.
//
// First, strip off anything before a `?` and `!`:
// - `REMOVE?KEEP`
// - `REMOVE!KEEP`
//
// TODO(106): Revise code and tests for `fullPath`.
// https://github.com/FormidableLabs/inspectpack/issues/106
export const _normalizeWebpackPath = (identifier: string, name?: string): string => {
  const bangLastIdx = identifier.lastIndexOf("!");
  const questionLastIdx = identifier.lastIndexOf("?");
  const prefixEnd = Math.max(bangLastIdx, questionLastIdx);

  let candidate = identifier;

  // Remove prefix here.
  if (prefixEnd > -1) {
    candidate = candidate.substr(prefixEnd + 1);
  }

  // Naive heuristic: remove known starting webpack tokens.
  candidate = candidate.replace(/^(multi |ignored )/, "");

  // Assume a normalized then truncate to name if applicable.
  //
  // E.g.,
  // - `identifier`: "css /PATH/TO/node_modules/cache-loader/dist/cjs.js!STUFF
  //   !/PATH/TO/node_modules/font-awesome/css/font-awesome.css 0"
  // - `name`: "node_modules/font-awesome/css/font-awesome.css"
  //
  // Forms of name:
  // - v1, v2: "/PATH/TO/ROOT/~/pkg/index.js"
  // - v3: "/PATH/TO/ROOT/node_modules/pkg/index.js"
  // - v4: "./node_modules/pkg/index.js"
  if (name) {
    name = name
      .replace("/~/", "/node_modules/")
      .replace("\\~\\", "\\node_modules\\");

    if (name.startsWith("./") || name.startsWith(".\\")) {
      // Remove dot-slash relative part.
      name = name.slice(2);
    }

    // Now, truncate suffix of the candidate if name has less.
    const nameLastIdx = candidate.lastIndexOf(name);
    if (nameLastIdx > -1 && candidate.length !== nameLastIdx + name.length) {
      candidate = candidate.substr(0, nameLastIdx + name.length);
    }
  }

  return candidate;
};

// Convert a `node_modules` name to a base name.
//
// **Note**: Assumes only passed `node_modules` values.
//
// Normalizations:
// - Remove starting path if `./`
// - Switch Windows paths to Mac/Unix style.
export const _getBaseName = (name: string): string | null => {
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
  private _ignoredPackages: (string | RegExp)[];
  private _duplicatesOnly: boolean;

  constructor({ stats, ignoredPackages, duplicatesOnly }: IActionConstructor) {
    this.stats = stats;
    this._ignoredPackages = (ignoredPackages || [])
      .map((pattern) => typeof pattern === "string" ? `${pattern}/` : pattern);
    this._duplicatesOnly = duplicatesOnly !== false;
  }

  public validate(): Promise<IAction> {
    return Promise.resolve()
      .then(() => {
        // Validate the stats object.
        const result = RWebpackStats.decode(this.stats);
        if (isLeft(result)) {
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

  public get duplicatesOnly(): boolean {
    return this._duplicatesOnly;
  }

  // Whether or not we consider the data to indicate we should bail with error.
  public shouldBail(): Promise<boolean> {
    return Promise.resolve(false);
  }

  protected ignorePackage(baseName: string): boolean {
    const base = toPosixPath(baseName.trim());
    return this._ignoredPackages.some((pattern) => typeof pattern === "string" ?
      base.startsWith(pattern) :
      (pattern as RegExp).test(base),
    );
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

          // Fields
          let isSynthetic = false;
          let source = null;
          let identifier;
          let name;
          let size;

          if (isRight(RWebpackStatsModuleModules.decode(mod))) {
            // Recursive case -- more modules.
            const modsMod = mod as IWebpackStatsModuleModules;

            // Return and recurse.
            return list.concat(this.getSourceMods(modsMod.modules, chunks));

          } else if (isRight(RWebpackStatsModuleSource.decode(mod))) {
            // webpack5+: Check if an orphan and just skip entirely.
            if (
              isRight(RWebpackStatsModuleOrphan.decode(mod)) &&
              (mod as IWebpackStatsModuleOrphan).orphan
            ) {
              return list;
            }

            // Base case -- a normal source code module that is **not** an orphan.
            const srcMod = mod as IWebpackStatsModuleSource;
            identifier = srcMod.identifier;
            name = srcMod.name;
            // Note: there are isolated cases where webpack4 appears to be
            // wrong in it's `size` estimation vs the actual string length.
            // See `version mismatch for v1-v4 moment-app` wherein the
            // real length of `moment/locale/es-us.js` is 3017 but webpack
            // v4 reports it in stats object as 3029.
            size = srcMod.source.length || srcMod.size;
            source = srcMod.source;

          } else if (isRight(RWebpackStatsModuleSynthetic.decode(mod))) {
            // Catch-all case -- a module without modules or source.
            const syntheticMod = mod as IWebpackStatsModuleSynthetic;
            identifier = syntheticMod.identifier;
            name = syntheticMod.name;
            size = syntheticMod.size;
            isSynthetic = true;

          } else {
            throw new Error(`Cannot match to known module type: ${JSON.stringify(mod)}`);
          }

          // We've now got a single entry to prepare and add.
          const normalizedName = _normalizeWebpackPath(name);
          const normalizedId = _normalizeWebpackPath(identifier, normalizedName);
          const isNodeModules = _isNodeModules(normalizedId);
          const baseName = isNodeModules ? _getBaseName(normalizedId) : null;

          if (baseName && this.ignorePackage(baseName)) {
            return list;
          }

          return list.concat([{
            baseName,
            chunks,
            identifier,
            isNodeModules,
            isSynthetic,
            size,
            source,
          }]);
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
        // Skip null chunks, allowing only strings or numbers.
        if (chunk === null) { return; }

        chunk = chunk.toString(); // force to string.
        chunksToAssets[chunk] = chunksToAssets[chunk] || new Set();

        // Add unique assets.
        chunksToAssets[chunk].add(asset.name);
      });
    });

    // Iterate modules and attach as appropriate.
    this.modules.forEach((mod) => {
      mod.chunks.forEach((chunk) => {
        // Skip null chunks, allowing only strings or numbers.
        if (chunk === null) { return; }

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
