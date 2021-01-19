import { expect } from "chai";
import * as chalk from "chalk";
import { join, resolve } from "path";

import { IAction, IModulesByAsset, TemplateFormat } from "../../../src/lib/actions/base";
import { create, ISizesData } from "../../../src/lib/actions/sizes";
import { IModule } from "../../../src/lib/interfaces/modules";
import { IWebpackStatsChunk } from "../../../src/lib/interfaces/webpack-stats";
import { toPosixPath } from "../../../src/lib/util/files";
import {
  FIXTURES,
  FIXTURES_WEBPACK1_SKIPLIST,
  IFixtures,
  JSON_PATH_RE,
  loadFixtures,
  normalizeOutput,
  patchAllMods,
  treeShakingWorks,
  TEXT_PATH_RE,
  TSV_PATH_RE,
  VERSIONS,
  VERSIONS_LATEST,
  VERSIONS_LATEST_IDX,
} from "../../utils";

const PATCHED_MOMENT_LOCALE_ES = {
  baseName: "moment/locale|sync|/es/",
  identifier: resolve(__dirname, "../../../node_modules/moment/locale|sync|/es/"),
  size: 100,
  source: "REMOVED",
};

// Keyed off `baseName`.
// Should be `IWebpackStatsModuleBase`, but want subset to merge and override.
interface IPatchedMods { [id: string]: any; }
const PATCHED_MODS: IPatchedMods = {
  // Normalize legacy/modern moment synthetic module names.
  "moment/locale /es/": PATCHED_MOMENT_LOCALE_ES,
  "moment/locale|/es/": PATCHED_MOMENT_LOCALE_ES,
  "moment/locale sync /es/": PATCHED_MOMENT_LOCALE_ES,
  "moment/locale|sync|/es/": PATCHED_MOMENT_LOCALE_ES,
};

// Patch in _all_ assets.
const PATCHED_ASSETS_ALL = {
  // Emitted was added in late webpack4.
  // (_Note_: Really bool, typically `false` in our fixtures)
  emitted: "REMOVED",
  info: {},
};

// Normalize actions across different versions of webpack.
// Mutates.
const patchAction = (name: string) => (instance: IAction) => {
  // Patch internal data based on baseName keys.
  // **Note**: Patch modules **first** since memoized, then used by assets.
  (instance as any)._modules = instance.modules
    .map((mod) => {
      // Ignore webpack5+ runtime helpers
      if (mod.isSynthetic && mod.identifier.startsWith("webpack/runtime/")) {
        return null;
      }

      // Normalize / remove internal additions.
      if (
        [
          // webpack5+ doesn't add polyfills.
          "process/browser.js",
          "setimmediate/setImmediate.js",
          "timers-browserify/main.js",

          // webpack5+ doesn't always add these built-ins.
          "webpack/buildin/global.js",
          "webpack/buildin/module.js",
        ].includes(mod.baseName || "")
      ) {
        return null;
      }

      // Apply general mutation mappings.
      const patched = mod.baseName && PATCHED_MODS[mod.baseName];
      return patched ? { ...mod, ...patched } : mod;
    })
    .filter(Boolean)
    .map(patchAllMods);

  // Patch assets scenarios manually.
  // - `multiple-chunks`: just use the normal bundle, not the split stuff.
  //   The splits are too varying to try and manually track.
  if (name.startsWith("multiple-chunks")) {
    (instance as any)._assets = {
      "bundle-multiple.js": instance.assets["bundle-multiple.js"],
      "bundle.js": instance.assets["bundle.js"],
    };
  }

  // Iterate assets.
  Object.keys(instance.assets).forEach((assetName) => {
    // Patch all.
    (instance as any)._assets[assetName].asset = {
      ...instance.assets[assetName].asset,
      ...(instance as any)._assets[assetName].asset,
      ...PATCHED_ASSETS_ALL,
    };
  });

  return instance;
};

// Normalize getData calls.
// Mutates.
const patchData = (data: ISizesData) => {
  const assets = Object.keys(data.assets)
    .reduce((memo, asset) => ({
      ...memo,
      [asset]: {
        ...data.assets[asset],
        meta: {
          full: 700,
        },
      },
    }), {});

  return {
    ...data,
    assets,
    meta: {
      full: 800,
    },
  };
};

// Normalize modules for comparison.
// - `chunks` are emptied because different by webpack version.
const normalizeModules = (modules: IModule[]) => modules.map((mod) => ({ ...mod, chunks: [] }));

const normalizeAsset = (asset: object) => {
  const normAsset = JSON.parse(JSON.stringify(asset));

  // Remove new fields not needed for tests.
  [
    "auxiliaryChunkIdHints",
    "auxiliaryChunkNames",
    "auxiliaryChunks",
    "cached",
    "chunkIdHints",
    "comparedForEmit",
    "filteredRelated",
    "isOverSizeLimit",
    "related",
    "type"
  ].forEach((field) => {
    delete normAsset[field];
  });

  return normAsset;
}

// Normalize assets for comparison.
// - `size` is hard-coded because different by webpack version's boilerplate / generated
//   code.
// - `chunks` can be different
// - `mods.chunks` can be different
const normalizeAssets = (modulesByAsset: IModulesByAsset) => Object.keys(modulesByAsset)
  .reduce((memo, name) => ({
    ...memo,
    [name]: {
      ...modulesByAsset[name],
      asset: {
        ...normalizeAsset(modulesByAsset[name].asset),
        chunks: [],
        size: 600,
      },
      mods: normalizeModules(modulesByAsset[name].mods),
    },
  }), {});

// We add the base class tests here that need a concrete implementation.
describe("lib/actions/base", () => {
  describe("modules, assets", () => {
    let fixtures: IFixtures;

    const getInstance = (name: string): Promise<IAction> => Promise.resolve()
      .then(() => create({ stats: fixtures[toPosixPath(name)] }))
      .then(patchAction(name));

    before(() => {
      return loadFixtures().then((f) => { fixtures = f; });
    });

    describe("all development versions", () => {
      FIXTURES.map((scenario) => {
        let instances: IAction[];

        before(() => {
          return Promise.all(
            VERSIONS.map((vers) => getInstance(join(scenario, `dist-development-${vers}`))),
          )
            .then((i) => { instances = i; });
        });

        VERSIONS.map((vers, i) => {
          if (i === VERSIONS_LATEST_IDX) { return; } // Skip last index, version "current".

          // Skip `import` + webpack@1.
          if (i === 0 && FIXTURES_WEBPACK1_SKIPLIST.indexOf(scenario) > -1) {
            it(`should match modules/assets v${vers}-v${VERSIONS_LATEST} for ${scenario} (SKIP v1)`);
            return;
          }

          it(`should match modules v${vers}-v${VERSIONS_LATEST} for ${scenario}`, () => {
            expect(normalizeModules(instances[i].modules),
              `version mismatch for v${vers}-v${VERSIONS_LATEST} ${scenario}`)
              .to.eql(normalizeModules(instances[VERSIONS_LATEST_IDX].modules));
          });

          it(`should match assets v${vers}-v${VERSIONS_LATEST} for ${scenario}`, () => {
            expect(normalizeAssets(instances[i].assets),
              `version mismatch for v${vers}-v${VERSIONS_LATEST} ${scenario}`)
              .to.eql(normalizeAssets(instances[VERSIONS_LATEST_IDX].assets));
          });
        });
      });
    });

    describe("development vs production", () => {
      FIXTURES.map((scenario) => {
        VERSIONS.map((vers) => {
          if (treeShakingWorks({ scenario, vers })) {
            it(`v${vers} scenario '${scenario}' should match (SKIP TREE-SHAKING)`);
            return;
          }

          it(`v${vers} scenario '${scenario}' should match`, () => {
            return Promise.all([
              getInstance(join(scenario, `dist-development-${vers}`)),
              getInstance(join(scenario, `dist-production-${vers}`)),
            ])
              .then((instances) => {
                const dev = normalizeModules(instances[0].modules);
                const prod = normalizeModules(instances[1].modules);
                expect(dev, `dev is empty for v${vers} ${scenario}`)
                  .to.not.equal(null).and
                  .to.not.equal(undefined).and
                  .to.not.eql([]).and
                  .to.not.eql({});
                expect(dev, `dev vs prod mismatch for v${vers} ${scenario}`).to.eql(prod);
              });
          });
        });
      });
    });

    describe("all production", () => {
      FIXTURES.map((scenario: string) => {
        let latestProdAssets: IModulesByAsset;

        before(() => {
          return getInstance(join(scenario, `dist-production-${VERSIONS_LATEST}`))
            .then((instance) => {
              latestProdAssets = normalizeAssets(instance.assets);
            });
        });

        VERSIONS.map((vers: string, i) => {
          // Skip latest version + limit to tree-shaking scenarios.
          if (i === VERSIONS_LATEST_IDX || !treeShakingWorks({ scenario, vers })) {
            return;
          }

          let curProdAssets: IModulesByAsset;

          before(() => {
            return getInstance(join(scenario, `dist-production-${vers}`))
              .then((instance) => {
                curProdAssets = normalizeAssets(instance.assets);
              });
          });

          // Note: We _don't_ match modules like above because orphaned modules
          // (e.g., `chunks = []` are treated differently in webpack4 vs 5).

          it(`should match assets v${vers}-v${VERSIONS_LATEST} for ${scenario}`, () => {
            expect(curProdAssets, `prod mismatch for v${vers}-v${VERSIONS_LATEST} ${scenario}`)
              .to.eql(latestProdAssets);
          });
        });
      });
    });
  });
});

describe("lib/actions/sizes", () => {
  let fixtures: IFixtures;
  let scopedInstance: IAction;

  const getData = (name: string): Promise<ISizesData> => Promise.resolve()
    .then(() => create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then(patchAction(name))
    .then((instance) => instance.getData() as Promise<ISizesData>)
    .then(patchData);

  before(() => loadFixtures().then((f) => { fixtures = f; }));

  beforeEach(() => Promise.all([
    "scoped",
  ].map((name) =>
    create({
      stats: fixtures[toPosixPath(join(name, `dist-development-${VERSIONS[VERSIONS.length - 1]}`))],
    })
    .validate()
    .then(patchAction(name)),
  ))
    .then((instances) => {
      [
        scopedInstance,
      ] = instances;
    }),
  );

  describe("getData", () => {
    describe("all development versions", () => {
      FIXTURES.map((scenario) => {
        let datas: ISizesData[];

        before(() => {
          return Promise.all(
            VERSIONS.map((vers) => getData(join(scenario, `dist-development-${vers}`))),
          )
            .then((d) => { datas = d as ISizesData[]; });
        });

        VERSIONS.map((vers, i) => {
          if (i === VERSIONS_LATEST_IDX) { return; } // Skip last index, version "current".

          // Skip `import` + webpack@1.
          if (i === 0 && FIXTURES_WEBPACK1_SKIPLIST.indexOf(scenario) > -1) {
            it(`should match v${vers}-v${VERSIONS_LATEST} for ${scenario} (SKIP v1)`);
            return;
          }

          it(`should match v${vers}-v${VERSIONS_LATEST} for ${scenario}`, () => {
            expect(datas[i], `version mismatch for v${vers}-v${VERSIONS_LATEST} ${scenario}`)
              .to.eql(datas[VERSIONS_LATEST_IDX]);
          });
        });
      });
    });

    describe("development vs production", () => {
      FIXTURES.map((scenario) => {
        VERSIONS.map((vers) => {
          if (treeShakingWorks({ scenario, vers })) {
            it(`v${vers} scenario '${scenario}' should match (SKIP TREE-SHAKING)`);
            return;
          }

          it(`v${vers} scenario '${scenario}' should match`, () => {
            return Promise.all([
              getData(join(scenario, `dist-development-${vers}`)),
              getData(join(scenario, `dist-production-${vers}`)),
            ])
              .then((datas) => {
                const dev = datas[0];
                const prod = datas[1];
                expect(dev, `dev is empty for v${vers} ${scenario}`)
                  .to.not.equal(null).and
                  .to.not.equal(undefined).and
                  .to.not.eql([]).and
                  .to.not.eql({});
                expect(dev, `dev vs prod mismatch for v${vers} ${scenario}`).to.eql(prod);
              });
          });
        });
      });
    });

    describe("all production", () => {
      FIXTURES.map((scenario: string) => {
        VERSIONS.map((vers: string, i) => {
          // Skip latest version + limit to tree-shaking scenarios.
          if (i === VERSIONS_LATEST_IDX || !treeShakingWorks({ scenario, vers })) {
            return;
          }

          let latestProd: ISizesData;

          before(() => {
            return getData(join(scenario, `dist-production-${VERSIONS_LATEST}`))
              .then((data) => { latestProd = data; })
          });

          it(`should match v${vers}-v${VERSIONS_LATEST} for ${scenario}`, () => {
            return getData(join(scenario, `dist-production-${vers}`))
              .then((curProd) => {
                expect(curProd, `prod is empty for v${vers} ${scenario}`)
                  .to.not.equal(null).and
                  .to.not.equal(undefined).and
                  .to.not.eql([]).and
                  .to.not.eql({});

                expect(curProd, `prod mismatch for v${vers}-v${VERSIONS_LATEST} ${scenario}`)
                  .to.eql(latestProd);
              });
          });
        });
      });
    });
  });

  describe("json", () => {
    /*tslint:disable max-line-length*/
    const expectedScopedData = {
      assets: {
        "bundle.js": {
          files: [
            {
              baseName: "@scope/foo/bike.js",
              fileName: "scoped/node_modules/@scope/foo/bike.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "@scope/foo/index.js",
              fileName: "scoped/node_modules/@scope/foo/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "bar/index.js",
              fileName: "scoped/node_modules/bar/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "bar/tender.js",
              fileName: "scoped/node_modules/bar/tender.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "flattened-foo/index.js",
              fileName: "scoped/node_modules/flattened-foo/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "unscoped-foo/index.js",
              fileName: "scoped/node_modules/unscoped-foo/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "deeper-unscoped/index.js",
              fileName: "scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "foo/car.js",
              fileName: "scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/car.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "foo/index.js",
              fileName: "scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "foo/car.js",
              fileName: "scoped/node_modules/unscoped-foo/node_modules/foo/car.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "foo/index.js",
              fileName: "scoped/node_modules/unscoped-foo/node_modules/foo/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "uses-foo/index.js",
              fileName: "scoped/node_modules/uses-foo/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: "@scope/foo/index.js",
              fileName: "scoped/node_modules/uses-foo/node_modules/@scope/foo/index.js",
              size: {
                full: "NUM",
              },
            },
            {
              baseName: null,
              fileName: "scoped/src/index.js",
              size: {
                full: "NUM",
              },
            },
          ],
          meta: {
            full: "NUM",
          },
        },
      },
      meta: {
        full: "NUM",
      },
    };
    /*tslint:enable max-line-length*/

    it("displays sizes correctly for scoped packages", () => {
      return scopedInstance.template.json()
        .then((dataStr) => {
          // Inflate to real object and re-use previous test assertions.
          const data = JSON.parse(normalizeOutput(JSON_PATH_RE, dataStr));

          expect(data).to.eql(expectedScopedData);
        });
    });

    // Regression test:
    // https://github.com/FormidableLabs/inspectpack/issues/110
    it("displays sizes correctly for scoped packages with null chunks", () => {
      // Mutate stats data to replicate null chunk scenario.

      // Add null asset chunk.
      scopedInstance.stats.assets[0].chunks = ([null] as IWebpackStatsChunk[]).concat(
        scopedInstance.stats.assets[0].chunks,
      );
      // Add null module chunks.
      scopedInstance.stats.modules.forEach((mod) => {
        if (mod.chunks) {
          mod.chunks = ([null, null, null] as IWebpackStatsChunk[]).concat(mod.chunks);
        }
      });

      return scopedInstance.template.json()
        .then((dataStr) => {
          // Inflate to real object and re-use previous test assertions.
          const data = JSON.parse(normalizeOutput(JSON_PATH_RE, dataStr));

          expect(data).to.eql(expectedScopedData);
        });
    });
  });

  describe("text", () => {
    let origChalkLevel: chalk.Level;

    beforeEach(() => {
      // Stash and disable chalk for tests.
      origChalkLevel = chalk.level;
      (chalk as any).level = 0;
    });

    afterEach(() => {
      (chalk as any).level = origChalkLevel;
    });

    it("displays sizes correctly for scoped packages", () => {
      return scopedInstance.template.text()
        .then((textStr) => {
          /*tslint:disable max-line-length*/
          expect(normalizeOutput(TEXT_PATH_RE, textStr)).to.eql(`
inspectpack --action=sizes
==========================

## Summary
* Bytes: NUM

## \`bundle.js\`
* Bytes: NUM
* scoped/node_modules/@scope/foo/bike.js
  * Size: NUM
* scoped/node_modules/@scope/foo/index.js
  * Size: NUM
* scoped/node_modules/bar/index.js
  * Size: NUM
* scoped/node_modules/bar/tender.js
  * Size: NUM
* scoped/node_modules/flattened-foo/index.js
  * Size: NUM
* scoped/node_modules/unscoped-foo/index.js
  * Size: NUM
* scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/index.js
  * Size: NUM
* scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/car.js
  * Size: NUM
* scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/index.js
  * Size: NUM
* scoped/node_modules/unscoped-foo/node_modules/foo/car.js
  * Size: NUM
* scoped/node_modules/unscoped-foo/node_modules/foo/index.js
  * Size: NUM
* scoped/node_modules/uses-foo/index.js
  * Size: NUM
* scoped/node_modules/uses-foo/node_modules/@scope/foo/index.js
  * Size: NUM
* scoped/src/index.js
  * Size: NUM

          `.trim());
          /*tslint:enable max-line-length*/
        });
    });
  });

  describe("tsv", () => {
    it("displays sizes correctly for scoped packages", () => {
      return scopedInstance.template.render(TemplateFormat.tsv)
        .then((tsvStr) => {
          /*tslint:disable max-line-length*/
          expect(normalizeOutput(TSV_PATH_RE, tsvStr)).to.eql(`
Asset	Full Name	Short Name	Size
bundle.js	scoped/node_modules/@scope/foo/bike.js	@scope/foo/bike.js	NUM
bundle.js	scoped/node_modules/@scope/foo/index.js	@scope/foo/index.js	NUM
bundle.js	scoped/node_modules/bar/index.js	bar/index.js	NUM
bundle.js	scoped/node_modules/bar/tender.js	bar/tender.js	NUM
bundle.js	scoped/node_modules/flattened-foo/index.js	flattened-foo/index.js	NUM
bundle.js	scoped/node_modules/unscoped-foo/index.js	unscoped-foo/index.js	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/index.js	deeper-unscoped/index.js	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/car.js	foo/car.js	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/index.js	foo/index.js	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/foo/car.js	foo/car.js	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/foo/index.js	foo/index.js	NUM
bundle.js	scoped/node_modules/uses-foo/index.js	uses-foo/index.js	NUM
bundle.js	scoped/node_modules/uses-foo/node_modules/@scope/foo/index.js	@scope/foo/index.js	NUM
bundle.js	scoped/src/index.js	(source)	NUM
          `.trim());
          /*tslint:enable max-line-length*/
        });
    });
  });

});
