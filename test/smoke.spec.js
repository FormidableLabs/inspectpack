"use strict";

const fs = require("fs");
const path = require("path");
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");
const expect = require("chai").expect;
const pify = require("pify");

const duplicates = pify(require("../lib/actions/duplicates"));
const pattern = pify(require("../lib/actions/pattern"));
const parse = pify(require("../lib/actions/parse"));
const files = pify(require("../lib/actions/files"));
const versions = pify(require("../lib/actions/versions"));
const sizes = pify(require("../lib/actions/sizes"));

const InspectpackDaemon = require("../lib/daemon");

const fixtureRoot = path.dirname(require.resolve("inspectpack-test-fixtures/package.json"));
const readFile = (relPath) => fs.readFileSync(path.join(fixtureRoot, relPath), "utf8");
const fixtures = {
  basic: readFile("built/basic-lodash-object-expression.js"),
  badBundle: readFile("dist/bad-bundle.js"),
  emptyManifest: readFile("dist/empty-manifest.js")
};

const testOutputDir = path.resolve("test-output");

describe("Smoke tests", () => {
  it("analyzes duplicates", () =>
    duplicates({
      code: fixtures.badBundle,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.deep.property("meta.numFilesWithDuplicates", 1);
      })
  );

  it("analyzes suspicious patterns", () =>
    pattern({
      code: fixtures.badBundle,
      suspectPatterns: true,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.deep.property("meta.numMatches", 2);
      })
  );

  it("analyzes suspicious parses", () =>
    parse({
      code: fixtures.basic,
      parseFns: {
        TEST_PARSE(src) {
          return src.indexOf("oh hai mark") !== -1;
        }
      },
      suspectParses: true,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.deep.property("meta.numMatches", 1);
      })
  );

  it("analyzes suspicious files", () =>
    files({
      code: fixtures.badBundle,
      suspectFiles: true,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.deep.property("meta.numMatches", 5);
      })
  );

  it("analyzes version skews", () =>
    versions({
      code: fixtures.badBundle,
      root: fixtureRoot,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.property("versions");
      })
  );

  it("analyzes bundle sizes in bad fixture", () =>
    sizes({
      code: fixtures.badBundle,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.property("sizes").with.lengthOf(125);

        const codes = result.sizes;
        expect(codes[0]).to.have.property("id", "0");
        expect(codes[0]).to.have.property("baseName", "moment/moment.js");
        expect(codes[0]).to.have.property("type", "code");

        expect(codes[1]).to.have.property("id", "1");
        expect(codes[1]).to.have.property("fileName", "(webpack)/buildin/module.js");
        expect(codes[1]).to.have.property("type", "code");

        expect(codes[2]).to.have.property("id", "2");
        expect(codes[2]).to.have.property("baseName", "(webpack)/buildin/global.js");
        expect(codes[2]).to.have.property("type", "code");

        expect(codes[124]).to.have.property("id", "124");
        expect(codes[124]).to.have.property("baseName", "./src/bad-bundle.js");
        expect(codes[124]).to.have.property("type", "code");
      })
  );

  it("analyzes bundle sizes in basic fixture", () =>
    sizes({
      code: fixtures.basic,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.property("sizes").with.lengthOf(4);

        const codes = result.sizes;
        expect(codes[0]).to.have.property("id", "1");
        expect(codes[0]).to.have.property("fileName", "(webpack)/buildin/global.js");
        expect(codes[0]).to.have.property("type", "code");

        expect(codes[1]).to.have.property("id", "15");
        expect(codes[1]).to.have.property("baseName", "(webpack)/buildin/module.js");
        expect(codes[1]).to.have.property("type", "code");

        expect(codes[2]).to.have.property("id", "36");
        expect(codes[2]).to.have.property("baseName", "lodash/lodash.js");
        expect(codes[2]).to.have.property("type", "code");

        expect(codes[3]).to.have.property("id", "39");
        expect(codes[3]).to.have.property("baseName", "./demo/index.js");
        expect(codes[3]).to.have.property("type", "code");
      })
  );

  // Regression test:
  // `Webpack empty manifest file produces "Error: No code sections found" exception.`
  // https://github.com/FormidableLabs/webpack-dashboard/issues/189
  it("handles empty manifest pattern", () =>
    sizes({
      code: fixtures.emptyManifest,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.property("sizes").with.lengthOf(0);
      })
  );

  describe("daemon", () => {
    beforeEach(() => mkdirp(testOutputDir));
    afterEach(done => rimraf(testOutputDir, done));

    it("runs actions in the daemon with a cache", () => {
      const NS_PER_SEC = 1e9;

      const daemon = InspectpackDaemon.create({
        cacheFilename: path.join(
          testOutputDir,
          ".inspectpack-test-cache.db"
        )
      });

      const coldStart = process.hrtime();
      let coldTime;
      let hotStart;
      let hotTime;

      return daemon.sizes({
        code: fixtures.badBundle,
        format: "object",
        minified: false,
        gzip: false
      })
        .then(() => {
          const time = process.hrtime(coldStart);
          coldTime = time[0] * NS_PER_SEC + time[1];
          hotStart = process.hrtime();
          return daemon.sizes({
            code: fixtures.badBundle,
            format: "object",
            minified: false,
            gzip: false
          });
        })
        .then(() => {
          const time = process.hrtime(hotStart);
          hotTime = time[0] * NS_PER_SEC + time[1];

          // Fail if the hot run isn't way faster than the cold run.
          // This indicates that the cache is failing.
          expect(hotTime).to.be.lessThan(coldTime / 3);
        });
    });
  });
});
