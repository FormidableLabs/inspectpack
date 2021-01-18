import { join, resolve, sep } from "path";

import { expect } from "chai";
import * as chalk from "chalk";
import * as merge from "deepmerge";
import * as mock from "mock-fs";

import { IAction } from "../../../src/lib/actions/base";
import {
  _packageName,
  _packageRoots,
  _requireSort,
  create,
  IVersionsData,
  IVersionsMeta,
} from "../../../src/lib/actions/versions";
import { IModule } from "../../../src/lib/interfaces/modules";
import { toPosixPath } from "../../../src/lib/util/files";
import {
  FIXTURES,
  FIXTURES_WEBPACK1_BLACKLIST,
  IFixtures,
  loadFixtureDirs,
  loadFixtures,
  patchAllMods,
  VERSIONS,
} from "../../utils";

export const EMPTY_VERSIONS_META: IVersionsMeta = {
  depended: {
    num: 0,
  },
  files: {
    num: 0,
  },
  installed: {
    num: 0,
  },
  packages: {
    num: 0,
  },
  resolved: {
    num: 0,
  },
};

export const EMPTY_VERSIONS_DATA: IVersionsData = {
  assets: {},
  meta: {
    ...EMPTY_VERSIONS_META,
    commonRoot: null,
    packageRoots: [],
  },
};

const BASE_DUPS_CJS_DATA = merge(EMPTY_VERSIONS_DATA, {
  meta: {
    commonRoot: resolve(__dirname, "../../fixtures/duplicates-cjs"),
    packageRoots: [resolve(__dirname, "../../fixtures/duplicates-cjs")],
  },
});

const BASE_SCOPED_DATA = merge(EMPTY_VERSIONS_DATA, {
  meta: {
    commonRoot: resolve(__dirname, "../../fixtures/scoped"),
    packageRoots: [resolve(__dirname, "../../fixtures/scoped")],
  },
});

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
const patchAction = (name: string) => (instance: IAction) => {
  // Patch all modules.
  (instance as any)._modules = instance.modules.map(patchAllMods(name));

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

describe("lib/actions/versions", () => {
  let fixtures: IFixtures;
  let fixtureDirs: any; // TODO(ts): Better typing
  let simpleInstance: IAction;
  let dupsCjsInstance: IAction;
  let scopedInstance: IAction;
  let multipleRootsInstance: IAction;
  let hiddenAppRootsInstance: IAction;
  let circularDepsInstance: IAction;

  const getData = (name: string): Promise<IVersionsData> => Promise.resolve()
    .then(() => create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then(patchAction(name))
    .then((instance) => instance.getData() as Promise<IVersionsData>);

  before(() => Promise.all([
    loadFixtures().then((f) => { fixtures = f; }),
    loadFixtureDirs().then((d) => { fixtureDirs = d; }),
  ]));

  beforeEach(() => Promise.all([
    "simple",
    "duplicates-cjs",
    "scoped",
    "multiple-roots",
    "hidden-app-roots",
    "circular-deps",
  ].map((name) => create({
      stats: fixtures[toPosixPath(join(name, `dist-development-${VERSIONS[VERSIONS.length - 1]}`))],
    }).validate()))
    .then((instances) => {
      [
        simpleInstance,
        dupsCjsInstance,
        scopedInstance,
        multipleRootsInstance,
        hiddenAppRootsInstance,
        circularDepsInstance,
      ] = instances;

      expect(simpleInstance).to.not.be.an("undefined");
      expect(dupsCjsInstance).to.not.be.an("undefined");
      expect(scopedInstance).to.not.be.an("undefined");
      expect(multipleRootsInstance).to.not.be.an("undefined");
      expect(hiddenAppRootsInstance).to.not.be.an("undefined");
      expect(circularDepsInstance).to.not.be.an("undefined");
    }),
  );

  afterEach(() => {
    mock.restore();
  });

  describe("getData", () => {
    describe("all development versions", () => {
      FIXTURES.map((scenario) => {
        const lastIdx = VERSIONS.length - 1;
        let datas: IVersionsData[];

        before(() => {
          return Promise.all(
            VERSIONS.map((vers) => getData(join(scenario, `dist-development-${vers}`))),
          )
            .then((d) => { datas = d as IVersionsData[]; });
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

    describe("node_modules scenarios", () => {
      it("errors on malformed root package.json", () => {
        mock({
          "test/fixtures/duplicates-cjs": {
            "package.json": "BAD_NOT_JSON",
          },
        });

        return dupsCjsInstance.getData()
        .then(() => {
          throw new Error("test should throw");
        })
        .catch((err) => {
          expect(err).to.have.property("message").that.contains("Unexpected token");
        });
      });

      it("permissively handles no root package.json", () => {
        mock({});

        return dupsCjsInstance.getData()
          .then((data) => {
            expect(data).to.eql(EMPTY_VERSIONS_DATA);
          });
      });

      it("permissively handles root package.json with no dependencies", () => {
        mock({
          "test/fixtures/simple": {
            "package.json": JSON.stringify({
              name: "simple",
              version: "1.2.3",
            }),
          },
        });

        return simpleInstance.getData()
          .then((data) => {
            expect(data).to.eql(EMPTY_VERSIONS_DATA);
          });
      });

      it("permissively handles root package.json with non-bundled dependencies", () => {
        mock({
          "test/fixtures/simple": {
            "package.json": JSON.stringify({
              dependencies: {
                "different-foo": "^1.0.1",
                "flattened-foo": "^1.1.0",
                "foo": "^1.0.0",
                "uses-foo": "^1.0.9",
              },
              name: "simple",
              version: "1.2.3",
            }),
          },
        });

        return simpleInstance.getData()
          .then((data) => {
            expect(data).to.eql(EMPTY_VERSIONS_DATA);
          });
      });

      it("throws if root package.json found with deps and without node_modules", () => {
        mock({
          "test/fixtures/duplicates-cjs": {
            "package.json": JSON.stringify({
              dependencies: {
                "different-foo": "^1.0.1",
                "flattened-foo": "^1.1.0",
                "foo": "^1.0.0",
                "uses-foo": "^1.0.9",
              },
              name: "duplicates-cjs",
              version: "1.2.3",
            }),
          },
        });

        return dupsCjsInstance.getData()
          .then(() => {
            throw new Error("test should throw");
          })
          .catch((err) => {
            expect(err).to.have.property("message").that.contains("node_modules");
          });
      });

      it("permissively handles root package.json with deps and empty node_modules", () => {
        mock({
          "test/fixtures/duplicates-cjs": {
            "node_modules": {},
            "package.json": JSON.stringify({
              dependencies: {
                "different-foo": "^1.0.1",
                "flattened-foo": "^1.1.0",
                "foo": "^1.0.0",
                "uses-foo": "^1.0.9",
              },
              name: "duplicates-cjs",
              version: "1.2.3",
            }),
          },
        });

        return dupsCjsInstance.getData()
          .then((data) => {
            expect(data).to.eql(merge(BASE_DUPS_CJS_DATA, {
              assets: {
                "bundle.js": {
                  meta: EMPTY_VERSIONS_META,
                  packages: {},
                },
              },
            }));
          });
      });

      it("reports ROOT@* for root level package", () => {
        // Just have one installed module.
        mock({
          "test/fixtures/duplicates-cjs": {
            "node_modules": {
              foo: {
                // foo/bike.js
                // foo/index.js
                "package.json": JSON.stringify({
                  name: "foo",
                  version: "1.1.1",
                }),
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                "different-foo": "^1.0.1",
                "flattened-foo": "^1.1.0",
                "foo": "^1.0.0",
                "uses-foo": "^1.0.9",
              },
            }),
          },
        });

        return dupsCjsInstance.getData()
          .then((data) => {
            expect(data).to.have.keys("meta", "assets");
            expect(data).to.have.property("meta").that.eql(merge(BASE_DUPS_CJS_DATA.meta, {
              depended: {
                num: 1,
              },
              files: {
                num: 2,
              },
              installed: {
                num: 1,
              },
              packages: {
                num: 1,
              },
              resolved: {
                num: 1,
              },
            }));

            // Should have one skew, the one we want.
            // We only look at the **first** skew part to see root package
            // inferred naming.
            expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.1\\.1\\.1.node_modules/foo.skews[0][0]",
            ).that.eql({
              name: "ROOT",
              range: "*",
              version: "*",
            });
          });
      });

      it("errors for unset name@version for non-root level", () => {
        mock({
          "test/fixtures/duplicates-cjs": {
            "node_modules": {
              foo: {
                "package.json": JSON.stringify({
                  name: "foo",
                }),
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                "different-foo": "^1.0.1",
                "flattened-foo": "^1.1.0",
                "foo": "^1.0.0",
                "uses-foo": "^1.0.9",
              },
              name: "duplicates-cjs",
              version: "1.2.3",
            }),
          },
        });

        return dupsCjsInstance.getData()
          .then(() => {
            throw new Error("test should throw");
          })
          .catch((err) => {
            expect(err).to.have.property("message").that.contains("package without version");
          });
      });

      it("handles 3 total included deps where only 2 end up with duplicates", () => {
        mock({
          "test/fixtures/duplicates-cjs": {
            "node_modules": {
              "different-foo": {
                "node_modules": {
                  foo: {
                    // different-foo/node_modules/foo/car.js
                    // different-foo/node_modules/foo/index.js
                    "package.json": JSON.stringify({
                      name: "foo",
                      version: "3.3.3",
                    }),
                  },
                },
                "package.json": JSON.stringify({
                  dependencies: {
                    foo: "^3.0.0",
                  },
                  name: "different-foo",
                  version: "1.0.2",
                }),
              },
              "foo": {
                // foo/bike.js
                // foo/index.js
                "package.json": JSON.stringify({
                  name: "foo",
                  version: "1.1.1",
                }),
              },
              "not-included": {
                "node_modules": {
                  foo: {
                    "package.json": JSON.stringify({
                      name: "foo",
                      version: "4.3.3",
                    }),
                  },
                },
                "package.json": JSON.stringify({
                  dependencies: {
                    foo: "^4.0.0",
                  },
                  name: "not-included",
                  version: "4.0.2",
                }),
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                "different-foo": "^1.0.1",
                "flattened-foo": "^1.1.0",
                "foo": "^1.0.0",
                "not-included": "^4.0.0",
                "uses-foo": "^1.0.9",
              },
            }),
          },
        });

        return dupsCjsInstance.getData()
          .then((data) => {
            expect(data).to.have.keys("meta", "assets");
            expect(data).to.have.property("meta").that.eql(merge(BASE_DUPS_CJS_DATA.meta, {
              depended: {
                num: 2,
              },
              files: {
                num: 4,
              },
              installed: {
                num: 2,
              },
              packages: {
                num: 1,
              },
              resolved: {
                num: 2,
              },
            }));

            // Should have 2 version skews, each with 1 depended + 2 modules
            let expectProp;

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.1\\.1\\.1.node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(2);

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.3\\.3\\.3.node_modules/different-foo/node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(2);
          });
      });

      it("displays versions skews correctly for flattened packages.", () => {
        // Use real on-disk scenario.
        mock({
          "test/fixtures/duplicates-cjs": fixtureDirs["test/fixtures/duplicates-cjs"],
        });

        return dupsCjsInstance.getData()
          .then((data) => {
            expect(data).to.have.keys("meta", "assets");
            expect(data).to.have.property("meta").that.eql(merge(BASE_DUPS_CJS_DATA.meta, {
              depended: {
                num: 4,
              },
              files: {
                num: 5,
              },
              installed: {
                num: 3,
              },
              packages: {
                num: 1,
              },
              resolved: {
                num: 3,
              },
            }));

            let expectProp;

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.1\\.1\\.1.node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(2);
            expectProp.to.have.property("modules").that.has.length(2);

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.2\\.2\\.2.node_modules/uses-foo/node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(1);

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.3\\.3\\.3.node_modules/different-foo/node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(2);
          });
      });

      it("displays versions skews correctly for scoped packages", () => {
        mock({
          "test/fixtures/scoped": fixtureDirs["test/fixtures/scoped"],
        });

        return scopedInstance.getData()
          .then((data) => {
            expect(data).to.have.keys("meta", "assets");
            expect(data).to.have.property("meta").that.eql(merge(BASE_SCOPED_DATA.meta, {
              depended: {
                num: 5,
              },
              files: {
                num: 7,
              },
              installed: {
                num: 4,
              },
              packages: {
                num: 2,
              },
              resolved: {
                num: 4,
              },
            }));

            let expectProp;

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.@scope/foo.1\\.1\\.1.node_modules/@scope/foo",
            );
            expectProp.to.have.property("skews").that.has.length(2);
            expectProp.to.have.property("modules").that.has.length(2);

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.@scope/foo.2\\.2\\.2.node_modules/uses-foo/node_modules/@scope/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(1);

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.3\\.3\\.3.node_modules/unscoped-foo/node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(2);

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.4\\.3\\.3.node_modules/unscoped-foo/" +
              "node_modules/deeper-unscoped/node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(2);
          });
      });

      // Regression test: https://github.com/FormidableLabs/inspectpack/issues/103
      it("displays versions skews correctly for hidden app roots", () => {
        mock({
          "test/fixtures/hidden-app-roots": fixtureDirs["test/fixtures/hidden-app-roots"],
        });

        return hiddenAppRootsInstance.getData()
          .then((data) => {
            expect(data).to.have.keys("meta", "assets");
            expect(data).to.have.property("meta").that.eql(merge(EMPTY_VERSIONS_DATA.meta, {
              commonRoot: resolve(__dirname, "../../fixtures/hidden-app-roots"),
              depended: {
                num: 2,
              },
              files: {
                num: 3,
              },
              installed: {
                num: 2,
              },
              packageRoots: [
                resolve(__dirname, "../../fixtures/hidden-app-roots"),
                resolve(__dirname, "../../fixtures/hidden-app-roots/packages/hidden-app"),
              ],
              packages: {
                num: 1,
              },
              resolved: {
                num: 2,
              },
            }));

            let expectProp;

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.1\\.1\\.1.node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(1);

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.3\\.3\\.3.node_modules/different-foo/node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(2);
          });
      });

      // Regression test: https://github.com/FormidableLabs/inspectpack/issues/103
      it("displays versions skews correctly for hidden app roots with empty node_modules", () => {
        const curFixtures = JSON.parse(JSON.stringify(fixtureDirs["test/fixtures/hidden-app-roots"]));
        // Add empty `node_modules` to hit different code path.
        curFixtures.packages["hidden-app"].node_modules = {};

        mock({
          "test/fixtures/hidden-app-roots": curFixtures,
        });

        return hiddenAppRootsInstance.getData()
          .then((data) => {
            expect(data).to.have.keys("meta", "assets");
            expect(data).to.have.property("meta").that.eql(merge(EMPTY_VERSIONS_DATA.meta, {
              commonRoot: resolve(__dirname, "../../fixtures/hidden-app-roots"),
              depended: {
                num: 2,
              },
              files: {
                num: 3,
              },
              installed: {
                num: 2,
              },
              packageRoots: [
                resolve(__dirname, "../../fixtures/hidden-app-roots"),
                resolve(__dirname, "../../fixtures/hidden-app-roots/packages/hidden-app"),
              ],
              packages: {
                num: 1,
              },
              resolved: {
                num: 2,
              },
            }));

            let expectProp;

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.1\\.1\\.1.node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(1);

            expectProp = expect(data).to.have.nested.property(
              "assets.bundle\\.js.packages.foo.3\\.3\\.3.node_modules/different-foo/node_modules/foo",
            );
            expectProp.to.have.property("skews").that.has.length(1);
            expectProp.to.have.property("modules").that.has.length(2);
          });
      });

      it("displays versions skews correctly for circular deps", () => {
        mock({
          "test/fixtures/circular-deps": fixtureDirs["test/fixtures/circular-deps"],
        });

        return circularDepsInstance.getData()
          .then((data) => {
            expect(data).to.have.keys("meta", "assets");
            expect(data).to.have.property("meta").that.eql(merge(EMPTY_VERSIONS_DATA.meta, {
              commonRoot: resolve(__dirname, "../../fixtures/circular-deps"),
              depended: {
                num: 0,
              },
              files: {
                num: 0,
              },
              installed: {
                num: 0,
              },
              packageRoots: [
                resolve(__dirname, "../../fixtures/circular-deps"),
              ],
              packages: {
                num: 0,
              },
              resolved: {
                num: 0,
              },
            }));

            expect(data).to.have.nested.property("assets.bundle\\.js");
          });
      });
    });
  });

  describe("json", () => {

    it("displays versions skews correctly for scoped packages", () => {
      mock({
        "test/fixtures/scoped": fixtureDirs["test/fixtures/scoped"],
      });

      return scopedInstance.template.json()
        .then((dataStr) => {
          // Inflate to real object and re-use previous test assertions.
          const data = JSON.parse(dataStr);

          expect(data).to.have.keys("meta", "assets");
          expect(data).to.have.property("meta").that.eql(merge(BASE_SCOPED_DATA.meta, {
            depended: {
              num: 5,
            },
            files: {
              num: 7,
            },
            installed: {
              num: 4,
            },
            packages: {
              num: 2,
            },
            resolved: {
              num: 4,
            },
          }));

          let expectProp;

          expectProp = expect(data).to.have.nested.property(
            "assets.bundle\\.js.packages.@scope/foo.1\\.1\\.1.node_modules/@scope/foo",
          );
          expectProp.to.have.property("skews").that.has.length(2);
          expectProp.to.have.property("modules").that.has.length(2);

          expectProp = expect(data).to.have.nested.property(
            "assets.bundle\\.js.packages.@scope/foo.2\\.2\\.2.node_modules/uses-foo/node_modules/@scope/foo",
          );
          expectProp.to.have.property("skews").that.has.length(1);
          expectProp.to.have.property("modules").that.has.length(1);

          expectProp = expect(data).to.have.nested.property(
            "assets.bundle\\.js.packages.foo.3\\.3\\.3.node_modules/unscoped-foo/node_modules/foo",
          );
          expectProp.to.have.property("skews").that.has.length(1);
          expectProp.to.have.property("modules").that.has.length(2);

          expectProp = expect(data).to.have.nested.property(
            "assets.bundle\\.js.packages.foo.4\\.3\\.3.node_modules/unscoped-foo/" +
            "node_modules/deeper-unscoped/node_modules/foo",
          );
          expectProp.to.have.property("skews").that.has.length(1);
          expectProp.to.have.property("modules").that.has.length(2);
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

    it("displays versions skews correctly for scoped packages", () => {
      mock({
        "test/fixtures/scoped": fixtureDirs["test/fixtures/scoped"],
      });

      return scopedInstance.template.text()
        .then((textStr) => {
          expect(textStr).to.eql(`
inspectpack --action=versions
=============================

## Summary
* Packages with skews:      2
* Total resolved versions:  4
* Total installed packages: 4
* Total depended packages:  5
* Total bundled files:      7

## \`bundle.js\`
* @scope/foo
  * 1.1.1
    * ~/@scope/foo
      * Num deps: 2, files: 2
      * scoped@1.2.3 -> @scope/foo@^1.0.9
      * scoped@1.2.3 -> flattened-foo@^1.1.0 -> @scope/foo@^1.1.1
  * 2.2.2
    * ~/uses-foo/~/@scope/foo
      * Num deps: 1, files: 1
      * scoped@1.2.3 -> uses-foo@^1.0.9 -> @scope/foo@^2.2.0
* foo
  * 3.3.3
    * ~/unscoped-foo/~/foo
      * Num deps: 1, files: 2
      * scoped@1.2.3 -> unscoped-foo@^1.0.9 -> foo@^3.3.0
  * 4.3.3
    * ~/unscoped-foo/~/deeper-unscoped/~/foo
      * Num deps: 1, files: 2
      * scoped@1.2.3 -> unscoped-foo@^1.0.9 -> deeper-unscoped@^1.0.0 -> foo@^4.0.0
          `.trim());
        });
    });

    it("displays versions skews correctly for multiple roots packages", () => {
      mock({
        "test/fixtures/multiple-roots": fixtureDirs["test/fixtures/multiple-roots"],
      });

      return multipleRootsInstance.template.text()
        .then((textStr) => {
          expect(textStr).to.eql(`
inspectpack --action=versions
=============================

## Summary
* Packages with skews:      1
* Total resolved versions:  2
* Total installed packages: 3
* Total depended packages:  3
* Total bundled files:      4

## \`bundle.js\`
* foo
  * 1.1.1
    * packages/package1/~/foo
      * Num deps: 1, files: 1
      * package1@1.1.1 -> foo@^1.0.0
    * packages/package2/~/foo
      * Num deps: 1, files: 1
      * package2@2.2.2 -> foo@^1.0.0
  * 3.3.3
    * ~/different-foo/~/foo
      * Num deps: 1, files: 2
      * multiple-roots@1.2.3 -> different-foo@^1.0.1 -> foo@^3.0.1
          `.trim());
        });
    });

    // Regression test: https://github.com/FormidableLabs/inspectpack/issues/103
    it("displays versions skews correctly for hidden app roots", () => {
      mock({
        "test/fixtures/hidden-app-roots": fixtureDirs["test/fixtures/hidden-app-roots"],
      });

      return hiddenAppRootsInstance.template.text()
        .then((textStr) => {
          expect(textStr).to.eql(`
inspectpack --action=versions
=============================

## Summary
* Packages with skews:      1
* Total resolved versions:  2
* Total installed packages: 2
* Total depended packages:  2
* Total bundled files:      3

## \`bundle.js\`
* foo
  * 1.1.1
    * ~/foo
      * Num deps: 1, files: 1
      * package1@1.1.1 -> foo@^1.0.0
  * 3.3.3
    * ~/different-foo/~/foo
      * Num deps: 1, files: 2
      * package1@1.1.1 -> different-foo@^1.0.1 -> foo@^3.0.1
          `.trim());
        });
    });
  });

  describe("tsv", () => {
    it("displays versions skews correctly for scoped packages", () => {
      mock({
        "test/fixtures/scoped": fixtureDirs["test/fixtures/scoped"],
      });

      return scopedInstance.template.tsv()
        .then((tsvStr) => {
          /*tslint:disable max-line-length*/
          expect(tsvStr).to.eql(`
Asset	Package	Version	Installed Path	Dependency Path
bundle.js	@scope/foo	1.1.1	~/@scope/foo	scoped@1.2.3 -> @scope/foo@^1.0.9
bundle.js	@scope/foo	1.1.1	~/@scope/foo	scoped@1.2.3 -> flattened-foo@^1.1.0 -> @scope/foo@^1.1.1
bundle.js	@scope/foo	2.2.2	~/uses-foo/~/@scope/foo	scoped@1.2.3 -> uses-foo@^1.0.9 -> @scope/foo@^2.2.0
bundle.js	foo	3.3.3	~/unscoped-foo/~/foo	scoped@1.2.3 -> unscoped-foo@^1.0.9 -> foo@^3.3.0
bundle.js	foo	4.3.3	~/unscoped-foo/~/deeper-unscoped/~/foo	scoped@1.2.3 -> unscoped-foo@^1.0.9 -> deeper-unscoped@^1.0.0 -> foo@^4.0.0
          `.trim());
          /*tslint:enable max-line-length*/
        });
    });

    // Regression test: https://github.com/FormidableLabs/inspectpack/issues/103
    it("displays versions skews correctly for hidden app roots", () => {
      mock({
        "test/fixtures/hidden-app-roots": fixtureDirs["test/fixtures/hidden-app-roots"],
      });

      return hiddenAppRootsInstance.template.tsv()
        .then((tsvStr) => {
          /*tslint:disable max-line-length*/
          expect(tsvStr).to.eql(`
Asset	Package	Version	Installed Path	Dependency Path
bundle.js	foo	1.1.1	~/foo	package1@1.1.1 -> foo@^1.0.0
bundle.js	foo	3.3.3	~/different-foo/~/foo	package1@1.1.1 -> different-foo@^1.0.1 -> foo@^3.0.1
          `.trim());
          /*tslint:enable max-line-length*/
        });
    });
  });

  describe("_requireSort", () => {
    it("handles base cases", () => {
      expect(_requireSort([])).to.eql([]);
    });

    it("handles simple roots", () => {
      const vals = [
        "/BASE",
        "/BASE/packages/hidden-app",
      ];

      expect(_requireSort(vals)).to.eql(vals);
    });

    it("handles complex roots", () => {
      expect(_requireSort([
        "/foo/two/a",
        "/foo/1/2",
        "/bar/foo/one/b",
        "/foo/one/b",
        "/bar/foo/one",
        "/bar/foo/one/a",
        "/foo/one",
        "/foo/one/a",
        "/bar/",
        "/foo/two",
        "/foo/1",
        "/bar/foo",
        "/foo/two/d",
        "/foo/",
      ])).to.eql([
        "/bar/",
        "/bar/foo",
        "/bar/foo/one",
        "/bar/foo/one/a",
        "/bar/foo/one/b",
        "/foo/",
        "/foo/1",
        "/foo/1/2",
        "/foo/one",
        "/foo/one/a",
        "/foo/one/b",
        "/foo/two",
        "/foo/two/a",
        "/foo/two/d",
      ]);
    });
  });

  describe("_packageRoots", () => {
    beforeEach(() => {
      mock({});
    });

    it("handles base cases", () => {
      return _packageRoots([]).then((pkgRoots) => {
        expect(pkgRoots).to.eql([]);
      });
    });

    it("handles no node_modules cases", () => {
      return _packageRoots([
        {
          identifier: resolve("src/baz/index.js"),
          isNodeModules: false,
        },
        {
          identifier: resolve("src/baz/bug.js"),
          isNodeModules: false,
        },
      ] as IModule[])
      .then((pkgRoots) => {
        expect(pkgRoots).to.eql([]);
      });
    });

    it("handles no node_modules with package.json cases", () => {
      mock({
        "src/baz": {
          "package.json": JSON.stringify({
            name: "baz",
          }, null, 2),
        },
      });

      return _packageRoots([
        {
          identifier: resolve("src/baz/index.js"),
          isNodeModules: false,
        },
        {
          identifier: resolve("src/baz/bug.js"),
          isNodeModules: false,
        },
      ] as IModule[])
      .then((pkgRoots) => {
        expect(pkgRoots).to.eql([]);
      });
    });

    it("handles simple cases", () => {
      mock({
        "my-app": {
          "package.json": JSON.stringify({
            name: "my-app",
          }, null, 2),
        },
      });

      return _packageRoots([
        {
          identifier: resolve("my-app/src/baz/index.js"),
          isNodeModules: false,
        },
        {
          identifier: resolve("my-app/node_modules/foo/index.js"),
          isNodeModules: true,
        },
        {
          identifier: resolve("my-app/node_modules/foo/node_modules/bug/bug.js"),
          isNodeModules: true,
        },
      ] as IModule[]).then((pkgRoots) => {
        expect(pkgRoots).to.eql([
          resolve("my-app"),
        ]);
      });
    });

    // Regression test: https://github.com/FormidableLabs/inspectpack/issues/103
    it("handles hidden application roots", () => {
      mock({
        "test/fixtures/hidden-app-roots": fixtureDirs["test/fixtures/hidden-app-roots"],
      });

      const appRoot = resolve("test/fixtures/hidden-app-roots");
      const mods =  [
        {
          identifier: "node_modules/different-foo/index.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/different-foo/node_modules/foo/car.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/different-foo/node_modules/foo/index.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/foo/index.js",
          isNodeModules: true,
        },
        {
          identifier: "packages/hidden-app/src/index.js",
          isNodeModules: false,
        },
      ].map(({ identifier, isNodeModules }) => ({
        identifier: join(appRoot, identifier),
        isNodeModules,
      }));

      return _packageRoots(mods as IModule[]).then((pkgRoots: string[]) => {
        expect(pkgRoots).to.eql([
          appRoot,
          join(appRoot, "packages/hidden-app"),
        ]);
      });
    });

    // Regression test: https://github.com/FormidableLabs/inspectpack/issues/103
    it("handles complex hidden application roots", () => {
      const appRoot = resolve("complex-hidden-app-roots");
      mock({
        "complex-hidden-app-roots": {
          "node_modules": {
            "fbjs": {
              "package.json":  JSON.stringify({
                name: "fbjs",
                version: "1.1.1",
              }, null, 2),
            },
            "hoist-non-react-statics": {
              "package.json":  JSON.stringify({
                name: "hoist-non-react-statics",
                version: "1.1.1",
              }, null, 2),
            },
            "prop-types": {
              "package.json":  JSON.stringify({
                name: "prop-types",
                version: "1.1.1",
              }, null, 2),
            },
            "react-addons-shallow-compare": {
              "node_modules": {
                "fbjs/package.json":  JSON.stringify({
                  name: "fbjs",
                  version: "2.2.2",
                }, null, 2),
              },
              "package.json":  JSON.stringify({
                dependencies: {
                  fbjs: "^2.0.0",
                },
                name: "react-addons-shallow-compare",
                version: "1.1.1",
              }, null, 2),
            },
            "react-apollo": {
              "node_modules": {
                "hoist-non-react-statics": {
                  "package.json":  JSON.stringify({
                    name: "hoist-non-react-statics",
                    version: "2.2.2",
                  }, null, 2),
                },
                "prop-types": {
                  "package.json":  JSON.stringify({
                    name: "prop-types",
                    version: "2.2.2",
                  }, null, 2),
                },
              },
              "package.json":  JSON.stringify({
                dependencies: {
                  "hoist-non-react-statics": "^2.0.0",
                  "prop-types": "^2.0.0",
                },
                name: "react-apollo",
                version: "1.1.1",
              }, null, 2),
            },
          },
          "package.json": JSON.stringify({
            name: "complex-hidden-app-roots",
          }, null, 2),
          "packages": {
            "hidden-app": {
              "package.json": JSON.stringify({
                dependencies: {
                  "fbjs": "^1.0.0",
                  "hoist-non-react-statics": "^1.0.0",
                  "prop-types": "^1.0.0",
                  "react-apollo": "^1.0.0",
                },
                name: "hidden-app",
              }, null, 2),
            },
          },
        },
      });

      // tslint:disable max-line-length
      const mods = [
        {
          identifier: "node_modules/prop-types/factoryWithThrowingShims.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/fbjs/lib/shallowEqual.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/react-addons-shallow-compare/node_modules/fbjs/lib/shallowEqual.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/react-apollo/node_modules/prop-types/factoryWithThrowingShims.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/react-apollo/node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/prop-types/lib/ReactPropTypesSecret.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/react-apollo/node_modules/prop-types/lib/ReactPropTypesSecret.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/css-in-js-utils/lib/hyphenateProperty.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/inline-style-prefixer/node_modules/css-in-js-utils/lib/hyphenateProperty.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/react-apollo/node_modules/prop-types/index.js",
          isNodeModules: true,
        },
        {
          identifier: "node_modules/prop-types/index.js",
          isNodeModules: true,
        },
        {
          identifier: "packages/hidden-app/src/index.js",
          isNodeModules: false,
        },
      ].map(({ identifier, isNodeModules }) => ({
        identifier: join(appRoot, identifier),
        isNodeModules,
      }));
      // tslint:enable max-line-length

      return _packageRoots(mods as IModule[]).then((pkgRoots: string[]) => {
        expect(pkgRoots).to.eql([
          "",
          "packages/hidden-app",
        ].map((id) => join(appRoot, id)));
      });
    });
  });

  describe("_packageName", () => {
    it("handles base cases", () => {
      expect(() => _packageName("")).to.throw("No package name was provided");
      expect(() => _packageName("    ")).to.throw("No package name was provided");
    });

    it("handles normal packages", () => {
      expect(_packageName("foo")).to.equal("foo");
      expect(_packageName("foo/index.js")).to.equal("foo");
      expect(_packageName("foo/bar/car.js  ")).to.equal("foo");
    });

    it("handles windows package paths", () => {
      expect(_packageName("foo")).to.equal("foo");
      expect(_packageName("foo\\index.js")).to.equal("foo");
      expect(_packageName("foo\\bar\\car.js  ")).to.equal("foo");
      expect(_packageName("@scope\\foo\\bar\\car.js")).to.equal("@scope/foo");
    });

    it("handles scoped packages", () => {
      expect(() => _packageName("@scope")).to.throw("missing package name");
      expect(_packageName("@scope/foo")).to.equal("@scope/foo");
      expect(_packageName("  @scope/foo/index.js")).to.equal("@scope/foo");
      expect(_packageName("@scope/foo/bar/car.js")).to.equal("@scope/foo");
    });

    it("handles synthetic packages", () => {
      expect(_packageName("moment/locale sync /es/")).to.equal("moment");
    });
  });
});
