import { expect } from "chai";
import { join, sep } from "path";

import { IAction, TemplateFormat } from "../../../src/lib/actions/base";
import { create, IDuplicatesData } from "../../../src/lib/actions/duplicates";
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

// Keyed off `scenario`. Remap chunk names.
interface IPatchedAsset { [scenario: string]: { [asset: string]: string }; }
const PATCHED_ASSETS: IPatchedAsset = {
  "multiple-chunks": {
    "0.js": "bar.js",
    "1.js": "different-foo.js",
    "2.js": "foo.js",
  },
};

// Normalize actions across different versions of webpack.
// Mutates.
//
// **Note**: Some egregious TS `any`-ing to get patches hooked up.
const patchAction = (name: string) => (instance: IAction) => {
  // Patch all modules.
  (instance as any)._modules = instance.modules.map(patchAllMods);

  // Patch assets scenarios via a rename LUT.
  const patches = PATCHED_ASSETS[name.split(sep)[0]];
  if (patches) {
    Object.keys(instance.assets).forEach((assetName) => {
      const reName = patches[assetName];
      if (reName) {
        (instance as any)._assets[reName] = (instance as any)._assets[assetName];
        delete (instance as any)._assets[assetName];
      }
    });
  }

  return instance;
};

describe("lib/actions/duplicates", () => {
  let fixtures: IFixtures;
  let scopedInstance: IAction;

  const getData = (name: string): Promise<IDuplicatesData> => Promise.resolve()
    .then(() => create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then(patchAction(name))
    .then((instance) => instance.getData() as Promise<IDuplicatesData>);

  before(() => loadFixtures().then((f) => { fixtures = f; }));

  beforeEach(() => Promise.all([
    "scoped",
  ].map((name) => create({
      stats: fixtures[toPosixPath(join(name, `dist-development-${VERSIONS[VERSIONS.length - 1]}`))],
    }).validate()))
    .then((instances) => {
      [
        scopedInstance,
      ] = instances;
    }),
  );

  describe("getData", () => {
    describe("all development versions", () => {
      FIXTURES.map((scenario: string) => {
        let datas: IDuplicatesData[];

        before(() => {
          return Promise.all(
            VERSIONS.map((vers: string) => getData(join(scenario, `dist-development-${vers}`))),
          )
            .then((d) => { datas = d as IDuplicatesData[]; });
        });

        VERSIONS.map((vers: string, i: number) => {
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
      FIXTURES.map((scenario: string) => {
        VERSIONS.map((vers: string) => {
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

          let latestProd: IDuplicatesData;

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
      return scopedInstance.template.render(TemplateFormat.tsv)
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
