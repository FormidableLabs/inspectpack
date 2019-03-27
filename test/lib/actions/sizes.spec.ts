import chalk from "chalk";
import { join, resolve } from "path";
import { create } from "../../../src/lib/actions/sizes";
import { toPosixPath } from "../../../src/lib/util/files";
import {
  FIXTURES,
  FIXTURES_WEBPACK1_BLACKLIST,
  JSON_PATH_RE,
  loadFixtures,
  normalizeOutput,
  TEXT_PATH_RE,
  TSV_PATH_RE,
  VERSIONS,
} from "../../utils";

const PATCHED_MOMENT_LOCALE_ES = {
  baseName: "moment/locale sync /es/",
  identifier: resolve(__dirname, "../../../node_modules/moment/locale sync /es/"),
  size: 100,
  source: "REMOVED",
};

// Keyed off `baseName`.
const PATCHED_MODS = {
  "moment/locale /es/": PATCHED_MOMENT_LOCALE_ES,
  "moment/locale sync /es/": PATCHED_MOMENT_LOCALE_ES,
  "webpack/buildin/global.js": {
    baseName: "webpack/buildin/global.js",
    identifier: resolve(__dirname, "../../../node_modules/webpack/buildin/global.js"),
    size: 300,
    source: "REMOVED",
  },
  "webpack/buildin/module.js": {
    baseName: "webpack/buildin/module.js",
    identifier: resolve(__dirname, "../../../node_modules/webpack/buildin/module.js"),
    size: 200,
    source: "REMOVED",
  },
};

// Normalize actions across different versions of webpack.
// Mutates.
const patchAction = (name) => (instance) => {
  // Patch internal data based on baseName keys.
  // **Note**: Patch modules **first** since memoized, then used by assets.
  instance._modules = instance.modules.map((mod) => {
    const patched = PATCHED_MODS[mod.baseName];
    return patched ? { ...mod, ...patched } : mod;
  });

  // Patch assets scenarios manually.
  // - `multiple-chunks`: just use the normal bundle, not the split stuff.
  //   The splits are too varying to try and manually track.
  if (name.startsWith("multiple-chunks")) {
    instance._assets = {
      "bundle-multiple.js": instance.assets["bundle-multiple.js"],
      "bundle.js": instance.assets["bundle.js"],
    };
  }

  return instance;
};

// Normalize getData calls.
// Mutates.
const patchData = (_) => (data) => {
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
const normalizeModules = (modules) => modules.map((mod) => ({ ...mod, chunks: [] }));

// Normalize assets for comparison.
// - `size` is hard-coded because different by webpack version's boilerplate / generated
//   code.
// - `chunks` can be different
// - `mods.chunks` can be different
const normalizeAssets = (modulesByAsset) => Object.keys(modulesByAsset)
  .reduce((memo, name) => ({
    ...memo,
    [name]: {
      ...modulesByAsset[name],
      asset: {
        ...modulesByAsset[name].asset,
        chunks: [],
        size: 600,
      },
      mods: normalizeModules(modulesByAsset[name].mods),
    },
  }), {});

// We add the base class tests here that need a concrete implementation.
describe("lib/actions/base", () => {
  describe("modules, assets", () => {
    let fixtures;

    const getInstance = (name) => Promise.resolve()
      .then(() => create({ stats: fixtures[toPosixPath(name)] }))
      .then(patchAction(name));

    before(() => {
      return loadFixtures().then((f) => { fixtures = f; });
    });

    describe("all versions", () => {
      FIXTURES.map((scenario) => {
        const lastIdx = VERSIONS.length - 1;
        let instances;

        before(() => {
          return Promise.all(
            VERSIONS.map((vers) => getInstance(join(scenario, `dist-development-${vers}`))),
          )
            .then((i) => { instances = i; });
        });

        VERSIONS.map((vers, i) => {
          if (i === lastIdx) { return; } // Skip last index, version "current".

          // Blacklist `import` + webpack@1 and skip test.
          if (i === 0 && FIXTURES_WEBPACK1_BLACKLIST.indexOf(scenario) > -1) {
            it(`should match v${vers}-v${lastIdx + 1} for ${scenario} (SKIP v1)`);
            return;
          }

          it(`should match modules v${vers}-v${lastIdx + 1} for ${scenario}`, () => {
            expect(normalizeModules(instances[i].modules),
              `version mismatch for v${vers}-v${lastIdx + 1} ${scenario}`)
              .to.eql(normalizeModules(instances[lastIdx].modules));
          });

          it(`should match assets v${vers}-v${lastIdx + 1} for ${scenario}`, () => {
            expect(normalizeAssets(instances[i].assets),
              `version mismatch for v${vers}-v${lastIdx + 1} ${scenario}`)
              .to.eql(normalizeAssets(instances[lastIdx].assets));
          });
        });
      });
    });

    describe("development vs production", () => {
      FIXTURES.map((scenario) => {
        VERSIONS.map((vers) => {
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
  });
});

describe("lib/actions/sizes", () => {
  let fixtures;
  let simpleInstance;
  let dupsCjsInstance;
  let scopedInstance;

  const getData = (name) => Promise.resolve()
    .then(() => create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then(patchAction(name))
    .then((instance) => instance.getData())
    .then(patchData(name));

  before(() => loadFixtures().then((f) => { fixtures = f; }));

  beforeEach(() => Promise.all([
    "simple",
    "duplicates-cjs",
    "scoped",
  ].map((name) =>
    create({
      stats: fixtures[toPosixPath(join(name, "dist-development-4"))],
    })
    .validate()
    .then(patchAction(name)),
  ))
    .then((instances) => {
      [
        simpleInstance,
        dupsCjsInstance,
        scopedInstance,
      ] = instances;
    }),
  );

  describe("getData", () => {
    describe("all versions", () => {
      FIXTURES.map((scenario) => {
        const lastIdx = VERSIONS.length - 1;
        let datas;

        before(() => {
          return Promise.all(
            VERSIONS.map((vers) => getData(join(scenario, `dist-development-${vers}`))),
          )
            .then((d) => { datas = d; });
        });

        VERSIONS.map((vers, i) => {
          if (i === lastIdx) { return; } // Skip last index, version "current".

          // Blacklist `import` + webpack@1 and skip test.
          if (i === 0 && FIXTURES_WEBPACK1_BLACKLIST.indexOf(scenario) > -1) {
            it(`should match v${vers}-v${lastIdx + 1} for ${scenario} (SKIP v1)`);
            return;
          }

          it(`should match v${vers}-v${lastIdx + 1} for ${scenario}`, () => {
            expect(datas[i], `version mismatch for v${vers}-v${lastIdx + 1} ${scenario}`)
              .to.eql(datas[lastIdx]);
          });
        });
      });
    });

    describe("development vs production", () => {
      FIXTURES.map((scenario) => {
        VERSIONS.map((vers) => {
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
      scopedInstance.stats.assets[0].chunks = [null].concat(
        scopedInstance.stats.assets[0].chunks,
      );

      // Add null module chunks.
      scopedInstance.stats.modules.forEach((mod) => {
        if (mod.chunks) {
          mod.chunks = [null, null, null].concat(mod.chunks);
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
    let origChalkEnabled;

    beforeEach(() => {
      // Stash and disable chalk for tests.
      origChalkEnabled = chalk.enabled;
      chalk.enabled = false;
    });

    afterEach(() => {
      chalk.enabled = origChalkEnabled;
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
      return scopedInstance.template.render("tsv")
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
