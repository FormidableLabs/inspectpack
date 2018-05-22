"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const io_ts_reporters_1 = require("io-ts-reporters");
const path_1 = require("path");
const webpack_stats_1 = require("../interfaces/webpack-stats");
const files_1 = require("../util/files");
const strings_1 = require("../util/strings");
// Note: Should only use with strings from `toPosixName()`.
const NM_RE = /(^|\/)(node_modules|\~)(\/|$)/g;
exports.nodeModulesParts = (name) => files_1.toPosixPath(name).split(NM_RE);
// True if name is part of a `node_modules` path.
exports._isNodeModules = (name) => exports.nodeModulesParts(name).length > 1;
// Convert a `node_modules` name to a base name.
//
// Normalizations:
// - Remove starting path if `./`
// - Switch Windows paths to Mac/Unix style.
// - Non-`node_modules` sources (e.g. "your" sources) return `null`.
exports._getBaseName = (name) => {
    // Not in `node_modules`.
    if (!exports._isNodeModules(name)) {
        return null;
    }
    // Slice to just after last occurrence of node_modules.
    const parts = exports.nodeModulesParts(name);
    const lastName = parts[parts.length - 1];
    // Normalize out the rest of the string.
    const candidate = path_1.normalize(path_1.relative(".", lastName));
    return candidate === "." ? "" : files_1.toPosixPath(candidate);
};
class Action {
    constructor({ stats }) {
        this.stats = stats;
    }
    validate() {
        return Promise.resolve()
            .then(() => {
            // Validate the stats object.
            const result = webpack_stats_1.RWebpackStats.decode(this.stats);
            if (result.isLeft()) {
                const errs = io_ts_reporters_1.reporter(result);
                throw new Error(`Invalid webpack stats object. (Errors: ${errs.join(", ")})`);
            }
        })
            .then(() => this);
    }
    // Create the internal data object for this action.
    //
    // This is a memoizing wrapper on the abstract internal method actions
    // must implement.
    getData() {
        return Promise.resolve()
            .then(() => this._data || this._getData())
            .then((data) => this._data = data);
    }
    // Flat array of webpack source modules only. (Memoized)
    get modules() {
        return this._modules = this._modules || this.getSourceMods(this.stats.modules);
    }
    getSourceMods(mods, parentChunks) {
        return mods
            // Recursively flatten to list of source modules.
            .reduce((list, mod) => {
            // Add in any parent chunks and ensure unique array.
            const chunks = Array.from(new Set(mod.chunks.concat(parentChunks || [])));
            if (webpack_stats_1.RWebpackStatsModuleSource.decode(mod).isRight()) {
                // Easy case -- a normal source code module.
                const srcMod = mod;
                const { identifier, size, source } = srcMod;
                return list.concat([{
                        baseName: exports._getBaseName(identifier),
                        chunks,
                        identifier,
                        isNodeModules: exports._isNodeModules(identifier),
                        isSynthetic: false,
                        size,
                        source,
                    }]);
            }
            else if (webpack_stats_1.RWebpackStatsModuleModules.decode(mod).isRight()) {
                // Recursive case -- more modules.
                const modsMod = mod;
                return list.concat(this.getSourceMods(modsMod.modules, chunks));
            }
            else if (webpack_stats_1.RWebpackStatsModuleSynthetic.decode(mod).isRight()) {
                // Catch-all case -- a module without modules or source.
                const syntheticMod = mod;
                const { identifier, size } = syntheticMod;
                return list.concat([{
                        baseName: exports._getBaseName(identifier),
                        chunks,
                        identifier,
                        isNodeModules: exports._isNodeModules(identifier),
                        isSynthetic: true,
                        size,
                        source: null,
                    }]);
            }
            throw new Error(`Cannot match to known module type: ${JSON.stringify(mod)}`);
        }, [])
            // Sort: via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare
            .sort((a, b) => a.identifier.localeCompare(b.identifier));
    }
    // Object of source modules grouped by asset. (Memoized)
    get assets() {
        return this._assets = this._assets || this.getSourceAssets(this.stats.assets);
    }
    getSourceAssets(assets) {
        // Helper: LUT from chunk to asset name.
        const chunksToAssets = {};
        // Actual working data object.
        const modulesSetByAsset = {};
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
            .sort(strings_1.sort)
            .reduce((memo, assetName) => {
            const assetSetObj = modulesSetByAsset[assetName];
            memo[assetName] = {
                asset: assetSetObj.asset,
                mods: Array.from(assetSetObj.mods),
            };
            return memo;
        }, {});
    }
    get template() {
        this._template = this._template || this._createTemplate();
        return this._template;
    }
}
exports.Action = Action;
var TemplateFormat;
(function (TemplateFormat) {
    TemplateFormat["json"] = "json";
    TemplateFormat["text"] = "text";
    TemplateFormat["tsv"] = "tsv";
})(TemplateFormat = exports.TemplateFormat || (exports.TemplateFormat = {}));
class Template {
    constructor({ action }) {
        this.action = action;
    }
    json() {
        return this.action.getData().then((data) => JSON.stringify(data, null, 2));
    }
    render(format) {
        return this[format]();
    }
    trim(str, num) {
        return str
            .trimRight() // trailing space.
            .replace(/^[ ]*\s*/m, "") // First line, if empty.
            .replace(new RegExp(`^[ ]{${num}}`, "gm"), "");
    }
}
exports.Template = Template;
