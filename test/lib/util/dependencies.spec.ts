import { join, resolve, sep } from "path";

import { expect } from "chai";
import * as mock from "mock-fs";
import * as sinon from "sinon";

import { toPosixPath } from "../../../src/lib/util/files";
import {
  _files,
  _findPackage,
  _resolvePackageMap,
  dependencies,
  readPackage,
  readPackages,
} from "../../../src/lib/util/dependencies";

const posixifyKeys = (obj) => Object.keys(obj)
  .reduce((memo, key) => ({ ...memo, [toPosixPath(key)]: obj[key] }), {});

const toNativePath = (filePath) => filePath.split("/").join(sep);
const nativifyKeys = (obj) => Object.keys(obj)
  .reduce((memo, key) => ({ ...memo, [toNativePath(key)]: obj[key] }), {});

describe("lib/util/dependencies", () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
    mock.restore();
  });

  describe("readPackage", () => {
    beforeEach(() => {
      sandbox.spy(_files, "readJson");
    });

    [
      { desc: "without cache", useCache: false },
      { desc: "with cache", useCache: true },
    ].forEach(({ desc, useCache }) => {
      describe(desc, () => {
        it("returns null for missed packages", () => {
          mock({});

          const cache = useCache ? {} : undefined;
          return Promise.all([
            readPackage("./package.json", cache),
            readPackage("./package.json", cache),
            readPackage("./package.json", cache),
          ])
            .then((results) => {
              expect(results).to.eql([null, null, null]);
              expect(_files.readJson).to.have.callCount(useCache ? 1 : 3);
            });
        });

        it("returns objects for found packages", () => {
          const pkg = {
            name: "foo",
            version: "1.0.0",
          };

          mock({
            "package.json": JSON.stringify(pkg),
          });

          const cache = useCache ? {} : undefined;
          return Promise.all([
            readPackage("./package.json", cache),
            readPackage("./package.json", cache),
            readPackage("./NOT_FOUND/package.json", cache),
            readPackage("./package.json", cache),
          ])
            .then((results) => {
              expect(results).to.eql([pkg, pkg, null, pkg]);
              expect(_files.readJson).to.have.callCount(useCache ? 2 : 4);
            });
        });

        it("errors on bad JSON", () => {
          mock({
            "package.json": "THIS_IS_NOT_JSON",
          });

          const cache = useCache ? {} : undefined;
          return Promise.all([
            readPackage("./package.json", cache),
            readPackage("./package.json", cache),
            readPackage("./NOT_FOUND/package.json", cache),
            readPackage("./package.json", cache),
          ])
            .then(() => {
              throw new Error("Should not reach then");
            })
            .catch((err) => {
              expect(err)
                .to.be.an.instanceOf(SyntaxError).and
                .to.have.property("message").that.contains("Unexpected token");

              // **Potentially brittle**: Because we invoke all in parallel, we
              // should have cache populated _first_ before any error strikes.
              //
              // **Note**: can remove this assert if it ends up being flaky.
              expect(_files.readJson).to.have.callCount(useCache ? 2 : 4);
            });
        });
      });
    });
  });

  describe("readPackages", () => {
    beforeEach(() => {
      sandbox.spy(_files, "readJson");
    });

    it("handles no root package.json", () => {
      mock({});

      return readPackages(".")
        .then(_resolvePackageMap)
        .then((pkgs) => {
          expect(pkgs).to.eql({});
        });
    });

    it("errors on bad package.json's", () => {
      const pkg = {
        name: "foo",
        version: "1.0.0",
      };

      mock({
        "node_modules": {
          bad: {
            "package.json": "THIS_IS_NOT_JSON",
          },
        },
        "package.json": JSON.stringify(pkg),
      });

      return readPackages(".")
        .then(_resolvePackageMap)
        .then(() => {
          throw new Error("Should not reach then");
        })
        .catch((err) => {
          expect(err)
            .to.be.an.instanceOf(SyntaxError).and
            .to.have.property("message").that.contains("Unexpected token");
        });
    });

    it("inflates a flattened tree", () => {
      const bar = {
        name: "bar",
        version: "1.0.0",
      };
      const baz = {
        name: "@scoped/baz",
        version: "1.0.0",
      };
      const foo = {
        name: "foo",
        version: "1.0.0",
      };

      mock({
        "node_modules": {
          "@scoped": {
            baz: {
              "package.json": JSON.stringify(baz),
            },
          },
          "bar": {
            "package.json": JSON.stringify(bar),
          },
        },
        "package.json": JSON.stringify(foo),
      });

      return readPackages(".")
        .then(_resolvePackageMap)
        .then(posixifyKeys)
        .then((pkgs) => {
          expect(pkgs).to.eql({
            "node_modules/@scoped/baz/package.json": baz,
            "node_modules/bar/package.json": bar,
            "package.json": foo,
          });
        });
    });

    it("inflates an unflattened tree", () => {
      const bar = {
        name: "bar",
        version: "1.0.0",
      };
      const baz = {
        name: "@scoped/baz",
        version: "1.0.0",
      };
      const foo = {
        name: "foo",
        version: "1.0.0",
      };

      mock({
        "node_modules": {
          bar: {
            "node_modules": {
              "@scoped": {
                baz: {
                  "package.json": JSON.stringify(baz),
                },
              },
            },
            "package.json": JSON.stringify(bar),
          },
        },
        "package.json": JSON.stringify(foo),
      });

      return readPackages(".")
        .then(_resolvePackageMap)
        .then(posixifyKeys)
        .then((pkgs) => {
          expect(pkgs).to.eql({
            "node_modules/bar/node_modules/@scoped/baz/package.json": baz,
            "node_modules/bar/package.json": bar,
            "package.json": foo,
          });
        });
    });

    it("includes multiple deps", () => {
      const foo1 = {
        name: "foo",
        version: "1.0.0",
      };
      const diffFoo = {
        dependencies: {
          foo: "^3.0.0",
        },
        name: "different-foo",
        version: "1.0.1",
      };
      const foo3 = {
        name: "foo",
        version: "3.0.0",
      };
      const base = {
        dependencies: {
          "different-foo": "1.0.0",
          "foo": "^3.0.0",
        },
        name: "base",
        version: "1.0.2",
      };

      mock({
        "node_modules": {
          "different-foo": {
            "node_modules": {
              foo: {
                "package.json": JSON.stringify(foo3),
              },
            },
            "package.json": JSON.stringify(diffFoo),
          },
          "foo": {
            "package.json": JSON.stringify(foo1),
          },
        },
        "package.json": JSON.stringify(base),
      });

      return readPackages(".")
        .then(_resolvePackageMap)
        .then(posixifyKeys)
        .then((pkgs) => {
          expect(pkgs).to.eql({
            "node_modules/different-foo/node_modules/foo/package.json": foo3,
            "node_modules/different-foo/package.json": diffFoo,
            "node_modules/foo/package.json": foo1,
            "package.json": base,
          });
        });
    });
  });

  describe("_findPackage", () => {
    const _baseArgs = { filePath: "base", name: "foo", pkgMap: {} };
    const _emptyResp = { isFlattened: false, pkgObj: null, pkgPath: null };

    it("handles empty cases", () => {
      const base = {
        dependencies: {
          foo: "^3.0.0",
        },
        name: "base",
        version: "1.0.2",
      };

      expect(_findPackage(_baseArgs)).to.eql(_emptyResp);

      expect(_findPackage({
        ..._baseArgs,
        name: "bar",
        pkgMap: nativifyKeys({
          "base/node_modules/foo/package.json": {
            name: "foo",
            version: "1.0.0",
          },
          "base/package.json": base,
        }),
      })).to.eql(_emptyResp);
    });

    it("finds unflattened packages", () => {
      const base = {
        dependencies: {
          foo: "^3.0.0",
        },
        name: "base",
        version: "1.0.2",
      };
      const foo = {
        name: "foo",
        version: "3.0.0",
      };

      expect(_findPackage({
        ..._baseArgs,
        pkgMap: nativifyKeys({
          "base/node_modules/foo/package.json": foo,
          "base/package.json": base,
        }),
      })).to.eql({
        isFlattened: false,
        pkgObj: foo,
        pkgPath: toNativePath("base/node_modules/foo"),
      });
    });

    it("finds hidden roots packages outside of file path", () => {
      const myPkg = {
        dependencies: {
          foo: "^3.0.0",
        },
        name: "my-pkg",
        version: "1.0.2",
      };
      const foo = {
        name: "foo",
        version: "3.0.0",
      };
      // Note: Base _doesn't_ have `foo` dependency.
      const base = {
        name: "base",
        version: "1.0.0",
      };

      expect(_findPackage({
        ..._baseArgs,
        filePath: "base/packages/my-pkg",
        pkgMap: nativifyKeys({
          "base/node_modules/foo/package.json": foo,
          "base/package.json": base,
          "base/packages/my-pkg/package.json": myPkg,
        }),
      })).to.eql({
        isFlattened: true,
        pkgObj: foo,
        pkgPath: toNativePath("base/node_modules/foo"),
      });
    });
  });

  describe("dependencies", () => {
    it("handles empty root path", () => {
      mock({});
      return dependencies(".")
        .then((deps) => {
          expect(deps).to.equal(null);
        });
    });

    it("handles no dependencies root package", () => {
      mock({
        "package.json": JSON.stringify({
          name: "hi",
        }),
      });

      const filePath = resolve(".");

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [],
            filePath,
            name: "hi",
            range: "*",
            version: "*",
          });
        });
    });

    it("handles empty dependencies root package", () => {
      mock({
        "package.json": JSON.stringify({
          dependencies: {},
          name: "hi",
          version: "1.2.3",
        }),
      });

      const filePath = resolve(".");

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [],
            filePath,
            name: "hi",
            range: "1.2.3",
            version: "1.2.3",
          });
        });
    });

    it("tolerates missing modules.", () => {
      mock({
        "node_modules": {
          foo: {
            "node_modules": {
              bar: {
                "package.json": JSON.stringify({
                  dependencies: {
                    baz: "^4.0.0",
                  },
                  name: "bar",
                  version: "3.4.7",
                }),
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                bar: "^3.4.5",
              },
              name: "foo",
              version: "2.3.5",
            }),
          },
        },
        "package.json": JSON.stringify({
          dependencies: {
            baz: "^4.0.0",
            foo: "^2.3.4",
          },
          name: "hi",
          version: "1.2.3",
        }),
      });

      const filePath = resolve(".");

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [
              {
                dependencies: [
                  {
                    dependencies: [],
                    filePath: join(filePath, "node_modules/foo/node_modules/bar"),
                    name: "bar",
                    range: "^3.4.5",
                    version: "3.4.7",
                  },
                ],
                filePath: join(filePath, "node_modules/foo"),
                name: "foo",
                range: "^2.3.4",
                version: "2.3.5",
              },
            ],
            filePath,
            name: "hi",
            range: "1.2.3",
            version: "1.2.3",
          });
        });
    });

    it("handles unflattened trees", () => {
      mock({
        "node_modules": {
          baz: {
            "package.json": JSON.stringify({
              name: "baz",
              version: "4.0.0",
            }),
          },
          foo: {
            "node_modules": {
              bar: {
                "node_modules": {
                  baz: {
                    "package.json": JSON.stringify({
                      name: "baz",
                      version: "4.0.0",
                    }),
                  },
                },
                "package.json": JSON.stringify({
                  dependencies: {
                    baz: "^4.0.0",
                  },
                  name: "bar",
                  version: "3.4.7",
                }),
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                bar: "^3.4.5",
              },
              name: "foo",
              version: "2.3.5",
            }),
          },
        },
        "package.json": JSON.stringify({
          dependencies: {
            baz: "^4.0.0",
            foo: "^2.3.4",
          },
          name: "hi",
          version: "1.2.3",
        }),
      });

      const filePath = resolve(".");

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [
              {
                dependencies: [],
                filePath: join(filePath, "node_modules/baz"),
                name: "baz",
                range: "^4.0.0",
                version: "4.0.0",
              },
              {
                dependencies: [
                  {
                    dependencies: [
                      {
                        dependencies: [],
                        filePath: join(filePath,
                          "node_modules/foo/node_modules/bar/node_modules/baz"),
                        name: "baz",
                        range: "^4.0.0",
                        version: "4.0.0",
                      },
                    ],
                    filePath: join(filePath, "node_modules/foo/node_modules/bar"),
                    name: "bar",
                    range: "^3.4.5",
                    version: "3.4.7",
                  },
                ],
                filePath: join(filePath, "node_modules/foo"),
                name: "foo",
                range: "^2.3.4",
                version: "2.3.5",
              },
            ],
            filePath,
            name: "hi",
            range: "1.2.3",
            version: "1.2.3",
          });
        });
    });

    it("handles flattened trees", () => {
      mock({
        "node_modules": {
          baz: {
            "package.json": JSON.stringify({
              name: "baz",
              version: "4.0.0",
            }),
          },
          catpower: {
            "package.json": JSON.stringify({
              dependencies: {
                baz: "^4.0.0",
              },
              name: "catpower",
              version: "1.0.0",
            }),
          },
          foo: {
            "node_modules": {
              bar: {
                "package.json": JSON.stringify({
                  dependencies: {
                    baz: "^4.0.0",
                  },
                  name: "bar",
                  version: "3.4.7",
                }),
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                bar: "^3.4.5",
                catpower: "^1.0.0",
              },
              name: "foo",
              version: "2.3.5",
            }),
          },
        },
        "package.json": JSON.stringify({
          dependencies: {
            baz: "^4.0.0",
            foo: "^2.3.4",
          },
          name: "hi",
          version: "1.2.3",
        }),
      });

      const filePath = resolve(".");

      // Convenience variable for our flattened package.
      const baz = {
        dependencies: [],
        filePath: join(filePath, "node_modules/baz"),
        name: "baz",
        range: "^4.0.0",
        version: "4.0.0",
      };

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [
              baz,
              {
                dependencies: [
                  {
                    dependencies: [
                      baz,
                    ],
                    filePath: join(filePath, "node_modules/foo/node_modules/bar"),
                    name: "bar",
                    range: "^3.4.5",
                    version: "3.4.7",
                  },
                  {
                    dependencies: [
                      baz,
                    ],
                    filePath: join(filePath, "node_modules/catpower"),
                    name: "catpower",
                    range: "^1.0.0",
                    version: "1.0.0",
                  },
                ],
                filePath: join(filePath, "node_modules/foo"),
                name: "foo",
                range: "^2.3.4",
                version: "2.3.5",
              },
            ],
            filePath,
            name: "hi",
            range: "1.2.3",
            version: "1.2.3",
          });
        });
    });

    it("handles scoped packages mixed in tree", () => {
      mock({
        "node_modules": {
          "@baz": {
            baz: {
              "package.json": JSON.stringify({
                name: "@baz/baz",
                version: "4.0.0",
              }),
            },
          },
          "catpower": {
            "package.json": JSON.stringify({
              dependencies: {
                "@baz/baz": "^4.0.0",
              },
              name: "catpower",
              version: "1.0.0",
            }),
          },
          "foo": {
            "node_modules": {
              "@bar": {
                bar: {
                  "package.json": JSON.stringify({
                    dependencies: {
                      "@baz/baz": "^4.0.0",
                    },
                    name: "@bar/bar",
                    version: "3.4.7",
                  }),
                },
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                "@bar/bar": "^3.4.5",
                "catpower": "^1.0.0",
              },
              name: "foo",
              version: "2.3.5",
            }),
          },
        },
        "package.json": JSON.stringify({
          dependencies: {
            "@baz/baz": "^4.0.0",
            "foo": "^2.3.4",
          },
          name: "hi",
          version: "1.2.3",
        }),
      });

      const filePath = resolve(".");

      // Convenience variable for our flattened package.
      const baz = {
        dependencies: [],
        filePath: join(filePath, "node_modules/@baz/baz"),
        name: "@baz/baz",
        range: "^4.0.0",
        version: "4.0.0",
      };

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [
              baz,
              {
                dependencies: [
                  {
                    dependencies: [
                      baz,
                    ],
                    filePath: join(filePath, "node_modules/foo/node_modules/@bar/bar"),
                    name: "@bar/bar",
                    range: "^3.4.5",
                    version: "3.4.7",
                  },
                  {
                    dependencies: [
                      baz,
                    ],
                    filePath: join(filePath, "node_modules/catpower"),
                    name: "catpower",
                    range: "^1.0.0",
                    version: "1.0.0",
                  },
                ],
                filePath: join(filePath, "node_modules/foo"),
                name: "foo",
                range: "^2.3.4",
                version: "2.3.5",
              },
            ],
            filePath,
            name: "hi",
            range: "1.2.3",
            version: "1.2.3",
          });
        });
    });

    it("handles missing dependencies permissively", () => {
      mock({
        "node_modules": {
          catpower: {
            "package.json": JSON.stringify({
              dependencies: {
                baz: "^4.0.0",
              },
              name: "catpower",
              version: "1.0.0",
            }),
          },
          foo: {
            "node_modules": {
              bar: {
                "package.json": JSON.stringify({
                  dependencies: {
                    baz: "^4.0.0",
                  },
                  name: "bar",
                  version: "3.4.7",
                }),
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                bar: "^3.4.5",
                catpower: "^1.0.0",
              },
              name: "foo",
              version: "2.3.5",
            }),
          },
        },
        "package.json": JSON.stringify({
          dependencies: {
            baz: "^4.0.0",
            foo: "^2.3.4",
          },
          name: "hi",
          version: "1.2.3",
        }),
      });

      const filePath = resolve(".");

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [
              {
                dependencies: [
                  {
                    dependencies: [],
                    filePath: join(filePath, "node_modules/foo/node_modules/bar"),
                    name: "bar",
                    range: "^3.4.5",
                    version: "3.4.7",
                  },
                  {
                    dependencies: [],
                    filePath: join(filePath, "node_modules/catpower"),
                    name: "catpower",
                    range: "^1.0.0",
                    version: "1.0.0",
                  },
                ],
                filePath: join(filePath, "node_modules/foo"),
                name: "foo",
                range: "^2.3.4",
                version: "2.3.5",
              },
            ],
            filePath,
            name: "hi",
            range: "1.2.3",
            version: "1.2.3",
          });
        });
    });

    it("handles deeply flattened, circular trees", () => {
      mock({
        "node_modules": {
          "@baz": {
            baz: {
              "package.json": JSON.stringify({
                dependencies: {
                  foo: "^2.3.4",
                },
                name: "@baz/baz",
                version: "4.0.0",
              }),
            },
          },
          "catpower": {
            "package.json": JSON.stringify({
              dependencies: {
                "@baz/baz": "^4.0.0",
              },
              name: "catpower",
              version: "1.0.0",
            }),
          },
          "foo": {
            "node_modules": {
              "@bar": {
                bar: {
                  "package.json": JSON.stringify({
                    dependencies: {
                      "@baz/baz": "^4.0.0",
                    },
                    name: "@bar/bar",
                    version: "3.4.7",
                  }),
                },
              },
            },
            "package.json": JSON.stringify({
              dependencies: {
                "@bar/bar": "^3.4.5",
                "catpower": "^1.0.0",
              },
              name: "foo",
              version: "2.3.5",
            }),
          },
        },
        "package.json": JSON.stringify({
          dependencies: {
            "@baz/baz": "^4.0.0",
            "foo": "^2.3.4",
          },
          name: "hi",
          version: "1.2.3",
        }),
      });

      const filePath = resolve(".");

      // These are the default circular (shorter) references for baz, foo
      const baz = {
        dependencies: [],
        filePath: join(filePath, "node_modules/@baz/baz"),
        name: "@baz/baz",
        range: "^4.0.0",
        version: "4.0.0",
      };

      const foo = {
        dependencies: [
          {
            dependencies: [],
            filePath: join(filePath, "node_modules/foo/node_modules/@bar/bar"),
            name: "@bar/bar",
            range: "^3.4.5",
            version: "3.4.7",
          },
          {
            dependencies: [],
            filePath: join(filePath, "node_modules/catpower"),
            name: "catpower",
            range: "^1.0.0",
            version: "1.0.0",
          },
        ],
        filePath: join(filePath, "node_modules/foo"),
        name: "foo",
        range: "^2.3.4",
        version: "2.3.5",
      };

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [
              // Root level (non-circular) of baz will have deps.
              {
                ...baz,
                dependencies: [foo],
              },
              {
                ...foo,
                dependencies: foo.dependencies.map((dep) => ({
                  ...dep,
                  dependencies: [baz],
                })),
              },
            ],
            filePath,
            name: "hi",
            range: "1.2.3",
            version: "1.2.3",
          });
        });
    });

    it("handles circular trees", () => {
      mock({
        "node_modules": {
          baz: {
            "package.json": JSON.stringify({
              dependencies: {
                foo: "^4.0.0",
              },
              name: "baz",
              version: "4.0.0",
            }),
          },
          foo: {
            "package.json": JSON.stringify({
              dependencies: {
                baz: "^4.0.0",
              },
              name: "foo",
              version: "4.0.0",
            }),
          },
        },
        "package.json": JSON.stringify({
          dependencies: {
            baz: "^4.0.0",
            foo: "^4.0.0",
          },
          name: "hi",
          version: "1.2.3",
        }),
      });

      const filePath = resolve(".");

      return dependencies(filePath)
        .then((deps) => {
          expect(deps).to.eql({
            dependencies: [
              {
                dependencies: [
                  {
                    dependencies: [],
                    filePath: join(filePath, "node_modules/foo"),
                    name: "foo",
                    range: "^4.0.0",
                    version: "4.0.0",
                  },
                ],
                filePath: join(filePath, "node_modules/baz"),
                name: "baz",
                range: "^4.0.0",
                version: "4.0.0",
              },
              {
                dependencies: [
                  {
                    dependencies: [],
                    filePath: join(filePath, "node_modules/baz"),
                    name: "baz",
                    range: "^4.0.0",
                    version: "4.0.0",
                  },
                ],
                filePath: join(filePath, "node_modules/foo"),
                name: "foo",
                range: "^4.0.0",
                version: "4.0.0",
              },
            ],
            filePath,
            name: "hi",
            range: "1.2.3",
            version: "1.2.3",
          });
        });
    });
  });
});
