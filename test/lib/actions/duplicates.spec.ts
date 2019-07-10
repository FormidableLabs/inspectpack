import chalk from "chalk";
import { join, sep } from "path";
import { create } from "../../../src/lib/actions/duplicates";
import { toPosixPath } from "../../../src/lib/util/files";
import {
  FIXTURES,
  FIXTURES_WEBPACK1_BLACKLIST,
  FIXTURES_WEBPACK4_BLACKLIST,
  JSON_PATH_RE,
  loadFixtures,
  normalizeOutput,
  patchAllMods,
  TEXT_PATH_RE,
  TSV_PATH_RE,
  VERSIONS,
} from "../../utils";

// Keyed off `scenario`. Remap chunk names.
const PATCHED_ASSETS = {
  "multiple-chunks": {
    "0.js": "bar.js",
    "1.js": "different-foo.js",
    "2.js": "foo.js",
  },
};

// Normalize actions across different versions of webpack.
// Mutates.
const patchAction = (name) => (instance) => {
  // Patch all modules.
  instance._modules = instance.modules.map(patchAllMods(name));

  // Patch assets scenarios via a rename LUT.
  const patches = PATCHED_ASSETS[name.split(sep)[0]];
  if (patches) {
    Object.keys(instance.assets).forEach((assetName) => {
      const reName = patches[assetName];
      if (reName) {
        instance._assets[reName] = instance._assets[assetName];
        delete instance._assets[assetName];
      }
    });
  }

  return instance;
};

describe("lib/actions/duplicates", () => {
  let fixtures;
  let simpleInstance;
  let dupsCjsInstance;
  let scopedInstance;

  const getData = (name) => Promise.resolve()
    .then(() => create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then(patchAction(name))
    .then((instance) => instance.getData());

  before(() => loadFixtures().then((f) => { fixtures = f; }));

  beforeEach(() => Promise.all([
    "simple",
    "duplicates-cjs",
    "scoped",
  ].map((name) => create({
      stats: fixtures[toPosixPath(join(name, "dist-development-4"))],
    }).validate()))
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

          // Blacklist `import` + webpack@4 and skip test.
          if (lastIdx + 1 === 4 && FIXTURES_WEBPACK4_BLACKLIST.indexOf(scenario) > -1) {
            it(`should match v${vers}-v${lastIdx + 1} for ${scenario} (SKIP v4)`);
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
    it("displays duplicates correctly for scoped packages", () => {
      return scopedInstance.template.json()
        .then((dataStr) => {
          // Inflate to real object and re-use previous test assertions.
          const data = JSON.parse(normalizeOutput(JSON_PATH_RE, dataStr));

          /*tslint:disable max-line-length*/
          expect(data).to.eql({
            assets: {
              "bundle.js": {
                files: {
                  "@scope/foo/index.js": {
                    meta: {
                      extraFiles: {
                        num: 1,
                      },
                      extraSources: {
                        bytes: "NUM",
                        num: 2,
                      },
                    },
                    sources: [
                      {
                        meta: {
                          extraFiles: {
                            num: 1,
                          },
                          extraSources: {
                            bytes: "NUM",
                            num: 2,
                          },
                        },
                        modules: [
                          {
                            baseName: "@scope/foo/index.js",
                            fileName: "scoped/node_modules/@scope/foo/index.js",
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
                        ],
                      },
                    ],
                  },
                  "foo/car.js": {
                    meta: {
                      extraFiles: {
                        num: 1,
                      },
                      extraSources: {
                        bytes: "NUM",
                        num: 2,
                      },
                    },
                    sources: [
                      {
                        meta: {
                          extraFiles: {
                            num: 1,
                          },
                          extraSources: {
                            bytes: "NUM",
                            num: 2,
                          },
                        },
                        modules: [
                          {
                            baseName: "foo/car.js",
                            fileName: "scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/car.js",
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
                        ],
                      },
                    ],
                  },
                  "foo/index.js": {
                    meta: {
                      extraFiles: {
                        num: 1,
                      },
                      extraSources: {
                        bytes: "NUM",
                        num: 2,
                      },
                    },
                    sources: [
                      {
                        meta: {
                          extraFiles: {
                            num: 1,
                          },
                          extraSources: {
                            bytes: "NUM",
                            num: 2,
                          },
                        },
                        modules: [
                          {
                            baseName: "foo/index.js",
                            fileName: "scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/index.js",
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
                        ],
                      },
                    ],
                  },
                },
                meta: {
                  extraFiles: {
                    num: 3,
                  },
                  extraSources: {
                    bytes: "NUM",
                    num: 6,
                  },
                },
              },
            },
            meta: {
              extraFiles: {
                num: 3,
              },
              extraSources: {
                bytes: "NUM",
                num: 6,
              },
            },
          });
          /*tslint:enable max-line-length*/
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

    it("displays duplicates correctly for scoped packages", () => {
      return scopedInstance.template.text()
        .then((textStr) => {
          /*tslint:disable max-line-length*/
          expect(normalizeOutput(TEXT_PATH_RE, textStr)).to.eql(`
inspectpack --action=duplicates
===============================

## Summary
* Extra Files (unique):         3
* Extra Sources (non-unique):   6
* Extra Bytes (non-unique):     NUM

## \`bundle.js\`
* @scope/foo/index.js
  * Meta: Files 1, Sources 2, Bytes NUM
  0. (Files 1, Sources 2, Bytes NUM)
    (NUM) scoped/node_modules/@scope/foo/index.js
    (NUM) scoped/node_modules/uses-foo/node_modules/@scope/foo/index.js
* foo/car.js
  * Meta: Files 1, Sources 2, Bytes NUM
  0. (Files 1, Sources 2, Bytes NUM)
    (NUM) scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/car.js
    (NUM) scoped/node_modules/unscoped-foo/node_modules/foo/car.js
* foo/index.js
  * Meta: Files 1, Sources 2, Bytes NUM
  0. (Files 1, Sources 2, Bytes NUM)
    (NUM) scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/index.js
    (NUM) scoped/node_modules/unscoped-foo/node_modules/foo/index.js
          `.trim());
          /*tslint:enable max-line-length*/
        });
    });
  });

  describe("tsv", () => {
    it("displays duplicates correctly for scoped packages", () => {
      return scopedInstance.template.render("tsv")
        .then((tsvStr) => {
          /*tslint:disable max-line-length*/
          expect(normalizeOutput(TSV_PATH_RE, tsvStr)).to.eql(`
Asset	Full Name	Short Name	Group Index	Size
bundle.js	scoped/node_modules/@scope/foo/index.js	@scope/foo/index.js	NUM	NUM
bundle.js	scoped/node_modules/uses-foo/node_modules/@scope/foo/index.js	@scope/foo/index.js	NUM	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/car.js	foo/car.js	NUM	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/foo/car.js	foo/car.js	NUM	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/index.js	foo/index.js	NUM	NUM
bundle.js	scoped/node_modules/unscoped-foo/node_modules/foo/index.js	foo/index.js	NUM	NUM
          `.trim());
          /*tslint:enable max-line-length*/
        });
    });
  });
});
