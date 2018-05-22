"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = require("chalk");
const modules_1 = require("../interfaces/modules");
const strings_1 = require("../util/strings");
const base_1 = require("./base");
/**
 * Create map of `basename` -> `source` -> `IModule`.
 *
 * @param mods {Array<IModule>} array of module objects.
 * @returns {IModulesByBaseNameBySource} map
 */
const modulesByBaseNameBySource = (mods) => {
    // Mutable, empty object to group base names with.
    const modsMap = {};
    // Iterate node_modules modules and add to keyed object.
    mods.forEach((mod) => {
        if (!mod.isNodeModules) {
            return;
        }
        // First level -- base name
        if (mod.baseName === null) { // Programming error.
            throw new Error(`Encountered non-node_modules null baseName: ${JSON.stringify(mod)}`);
        }
        const base = modsMap[mod.baseName] = modsMap[mod.baseName] || {};
        // Second level -- source.
        // Use token placeholder if synthetic.
        const source = mod.isSynthetic ? modules_1.SYNTHETIC_SOURCE_TOKEN : mod.source;
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
const createEmptySummary = () => ({
    extraFiles: {
        num: 0,
    },
    extraSources: {
        bytes: 0,
        num: 0,
    },
});
class Duplicates extends base_1.Action {
    _getData() {
        return Promise.resolve()
            .then(() => {
            const { assets } = this;
            const assetNames = Object.keys(assets).sort(strings_1.sort);
            // Get asset duplicates
            const assetDups = assetNames.reduce((dups, name) => {
                const modsMap = modulesByBaseNameBySource(assets[name].mods);
                return Object.assign({}, dups, { [name]: {
                        files: Object.keys(modsMap).reduce((files, baseName) => (Object.assign({}, files, { [baseName]: {
                                meta: createEmptySummary(),
                                sources: Object
                                    .keys(modsMap[baseName])
                                    .sort(strings_1.sort)
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
                            } })), {}),
                        meta: createEmptySummary(),
                    } });
            }, {});
            // Create real data object.
            // Start without any summaries. Just raw object structure.
            const data = {
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
    _createTemplate() {
        return new DuplicatesTemplate({ action: this });
    }
}
class DuplicatesTemplate extends base_1.Template {
    text() {
        return Promise.resolve()
            .then(() => this.action.getData())
            .then(({ meta, assets }) => {
            const dupAsset = (name) => chalk_1.default `{gray ## \`${name}\`}`;
            const dupFiles = (name) => Object.keys(assets[name].files)
                .map((baseName) => {
                const { files } = assets[name];
                const base = files[baseName];
                const inlineMeta = (obj) => `Files ${strings_1.numF(obj.extraFiles.num)}, ` +
                    `Sources ${strings_1.numF(obj.extraSources.num)}, ` +
                    `Bytes ${strings_1.numF(obj.extraSources.bytes)}`;
                const sources = files[baseName].sources
                    .map((sourceGroup, i) => this.trim(`
                ${i}. (${inlineMeta(sourceGroup.meta)})
                  ${sourceGroup.modules
                    .map((mod) => `(${mod.size.full}) ${chalk_1.default.gray(mod.fileName)}`)
                    .join("\n    ")}
              `, 14))
                    .join("\n  ");
                return this.trim(chalk_1.default `
              * {green ${baseName}}
                * Meta: ${inlineMeta(base.meta)}
                ${sources}
            `, 14);
            })
                .join("\n");
            const duplicates = (name) => `${dupAsset(name)}\n${dupFiles(name)}\n`;
            const report = this.trim(chalk_1.default `
          {cyan inspectpack --action=duplicates}
          {gray ===============================}

          {gray ## Summary}
          * Extra Files (unique):         ${strings_1.numF(meta.extraFiles.num)}
          * Extra Sources (non-unique):   ${strings_1.numF(meta.extraSources.num)}
          * Extra Bytes (non-unique):     ${strings_1.numF(meta.extraSources.bytes)}

          ${Object.keys(assets)
                .filter((name) => Object.keys(assets[name].files).length)
                .map(duplicates).join("\n")}
        `, 10);
            return report;
        });
    }
    tsv() {
        return Promise.resolve()
            .then(() => this.action.getData())
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
exports.create = (opts) => {
    return new Duplicates(opts);
};
