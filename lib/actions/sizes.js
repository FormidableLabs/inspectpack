"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = require("chalk");
const strings_1 = require("../util/strings");
const base_1 = require("./base");
class Sizes extends base_1.Action {
    _getData() {
        return Promise.resolve()
            .then(() => {
            const { assets } = this;
            const assetNames = Object.keys(assets).sort(strings_1.sort);
            // Iterate assets.
            const assetSizes = assetNames.reduce((memo, name) => (Object.assign({}, memo, { [name]: {
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
                } })), {});
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
    _createTemplate() {
        return new SizesTemplate({ action: this });
    }
}
class SizesTemplate extends base_1.Template {
    text() {
        return Promise.resolve()
            .then(() => this.action.getData())
            .then(({ meta, assets }) => {
            const files = (mods) => mods
                .map((obj) => this.trim(chalk_1.default `
            * {gray ${obj.fileName}}
              * Size: ${strings_1.numF(obj.size.full)}
          `, 12))
                .join("\n");
            const assetSizes = Object.keys(assets)
                .map((name) => this.trim(chalk_1.default `
            {gray ## \`${name}\`}
            * Bytes: ${strings_1.numF(assets[name].meta.full)}
            ${files(assets[name].files)}
          `, 12))
                .join("\n\n");
            const report = this.trim(chalk_1.default `
          {cyan inspectpack --action=sizes}
          {gray ==========================}

          {gray ## Summary}
          * Bytes: ${strings_1.numF(meta.full)}

          ${assetSizes}
        `, 10);
            return report;
        });
    }
    tsv() {
        return Promise.resolve()
            .then(() => this.action.getData())
            .then(({ assets }) => ["Asset\tFull Name\tShort Name\tSize"]
            .concat(Object.keys(assets)
            // Get items
            .map((name) => assets[name].files
            .map((obj) => [
            name,
            obj.fileName,
            obj.baseName === null ? "(source)" : obj.baseName,
            obj.size.full,
        ].join("\t")))
            // Flatten
            .reduce((m, a) => m.concat(a), [])
            .join("\n"))
            .join("\n"));
    }
}
exports.create = (opts) => {
    return new Sizes(opts);
};
