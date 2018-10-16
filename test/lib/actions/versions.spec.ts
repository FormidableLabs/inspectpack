import { join, resolve, sep } from "path";
import {
  _packageName,
  create,
  IVersionsData,
  IVersionsMeta,
} from "../../../src/lib/actions/versions";
import {
  FIXTURES,
  FIXTURES_WEBPACK1_BLACKLIST,
  loadFixtureDirs,
  loadFixtures,
  VERSIONS,
} from "../../utils";

import chalk from "chalk";
import * as merge from "deepmerge";
import * as mock from "mock-fs";
import { toPosixPath } from "../../../src/lib/util/files";

const EMPTY_VERSIONS_META: IVersionsMeta = {
  dependedPackages: {
    num: 0,
  },
  files: {
    num: 0,
  },
  skewedPackages: {
    num: 0,
  },
  skewedVersions: {
    num: 0,
  },
};

const EMPTY_VERSIONS_DATA: IVersionsData = {
  assets: {},
  meta: {
    ...EMPTY_VERSIONS_META,
    packageRoots: [],
  },
};

const BASE_DUPS_CJS_DATA = merge(EMPTY_VERSIONS_DATA, {
  meta: {
    packageRoots: [resolve(__dirname, "../../fixtures/duplicates-cjs")],
  },
});

const BASE_SCOPED_DATA = merge(EMPTY_VERSIONS_DATA, {
  meta: {
    packageRoots: [resolve(__dirname, "../../fixtures/scoped")],
  },
});

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

describe("lib/actions/versions", () => {
  let fixtures;
  let fixtureDirs;
  let simpleInstance;
  let dupsCjsInstance;
  let scopedInstance;
  let multipleRootsInstance;

  const getData = (name) => Promise.resolve()
    .then(() => create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then(patchAction(name))
    .then((instance) => instance.getData());

  before(() => Promise.all([
    loadFixtures().then((f) => { fixtures = f; }),
    loadFixtureDirs().then((d) => { fixtureDirs = d; }),
  ]));

  beforeEach(() => Promise.all([
    "simple",
    "duplicates-cjs",
    "scoped",
    "multiple-roots",
  ].map((name) => create({
      stats: fixtures[toPosixPath(join(name, "dist-development-4"))],
    }).validate()))
    .then((instances) => {
      [
        simpleInstance,
        dupsCjsInstance,
        scopedInstance,
        multipleRootsInstance,
      ] = instances;

      expect(simpleInstance).to.not.be.an("undefined");
      expect(dupsCjsInstance).to.not.be.an("undefined");
      expect(scopedInstance).to.not.be.an("undefined");
      expect(multipleRootsInstance).to.not.be.an("undefined");
    }),
  );

  afterEach(() => {
    mock.restore();
  });

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
              dependedPackages: {
                num: 1,
              },
              files: {
                num: 2,
              },
              skewedPackages: {
                num: 1,
              },
              skewedVersions: {
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
              dependedPackages: {
                num: 2,
              },
              files: {
                num: 4,
              },
              skewedPackages: {
                num: 1,
              },
              skewedVersions: {
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
              dependedPackages: {
                num: 4,
              },
              files: {
                num: 5,
              },
              skewedPackages: {
                num: 1,
              },
              skewedVersions: {
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
              dependedPackages: {
                num: 5,
              },
              files: {
                num: 7,
              },
              skewedPackages: {
                num: 2,
              },
              skewedVersions: {
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
            dependedPackages: {
              num: 5,
            },
            files: {
              num: 7,
            },
            skewedPackages: {
              num: 2,
            },
            skewedVersions: {
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
    let origChalkEnabled;

    beforeEach(() => {
      // Stash and disable chalk for tests.
      origChalkEnabled = chalk.enabled;
      chalk.enabled = false;
    });

    afterEach(() => {
      chalk.enabled = origChalkEnabled;
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
* Packages w/ Skews:        2
* Total skewed versions:    4
* Total depended packages:  5
* Total bundled files:      7

## \`bundle.js\`
* @scope/foo
  * 1.1.1
    * ~/@scope/foo
      * Num deps: 2, files: 2
      * scoped@1.2.3 -> @scope/foo@1.1.1
      * scoped@1.2.3 -> flattened-foo@1.1.1 -> @scope/foo@1.1.1
  * 2.2.2
    * ~/uses-foo/~/@scope/foo
      * Num deps: 1, files: 1
      * scoped@1.2.3 -> uses-foo@1.1.1 -> @scope/foo@2.2.2
* foo
  * 3.3.3
    * ~/unscoped-foo/~/foo
      * Num deps: 1, files: 2
      * scoped@1.2.3 -> different-foo@1.1.1 -> foo@3.3.3
  * 4.3.3
    * ~/unscoped-foo/~/deeper-unscoped/~/foo
      * Num deps: 1, files: 2
      * scoped@1.2.3 -> different-foo@1.1.1 -> deeper-unscoped@1.1.1 -> foo@4.3.3
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
* Packages w/ Skews:        1
* Total skewed versions:    2
* Total depended packages:  2
* Total bundled files:      4

## \`bundle.js\`
* foo
  * 1.1.1
    * ~/foo
      * Num deps: 1, files: 2
      * package2@2.2.2 -> foo@1.1.1
  * 3.3.3
    * ~/different-foo/~/foo
      * Num deps: 1, files: 2
      * multiple-roots@1.2.3 -> different-foo@1.1.1 -> foo@3.3.3
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
bundle.js	@scope/foo	1.1.1	~/@scope/foo	scoped@1.2.3 -> @scope/foo@1.1.1
bundle.js	@scope/foo	1.1.1	~/@scope/foo	scoped@1.2.3 -> flattened-foo@1.1.1 -> @scope/foo@1.1.1
bundle.js	@scope/foo	2.2.2	~/uses-foo/~/@scope/foo	scoped@1.2.3 -> uses-foo@1.1.1 -> @scope/foo@2.2.2
bundle.js	foo	3.3.3	~/unscoped-foo/~/foo	scoped@1.2.3 -> different-foo@1.1.1 -> foo@3.3.3
bundle.js	foo	4.3.3	~/unscoped-foo/~/deeper-unscoped/~/foo	scoped@1.2.3 -> different-foo@1.1.1 -> deeper-unscoped@1.1.1 -> foo@4.3.3
          `.trim());
          /*tslint:enable max-line-length*/
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
