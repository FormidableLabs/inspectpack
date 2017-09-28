"use strict";

const fs = require("fs");
const path = require("path");
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");
const pify = require("pify");

const sinon = require("sinon");
const sinonChai = require("sinon-chai");
const chai = require("chai");
chai.use(sinonChai);
const expect = chai.expect;

const duplicates = pify(require("../lib/actions/duplicates"));
const pattern = pify(require("../lib/actions/pattern"));
const parse = pify(require("../lib/actions/parse"));
const files = pify(require("../lib/actions/files"));
const versions = pify(require("../lib/actions/versions"));
const sizes = pify(require("../lib/actions/sizes"));

const InspectpackDaemon = require("../lib/daemon");
const Cache = require("../lib/utils/cache");
const NoopCache = Cache.NoopCache;
const SqliteCache = Cache.SqliteCache;

const fixtureRoot = path.dirname(require.resolve("inspectpack-test-fixtures/package.json"));
const readFile = (relPath) => fs.readFileSync(path.join(fixtureRoot, relPath), "utf8");
const fixtures = {
  basic: readFile("built/basic-lodash-object-expression.js"),
  badBundle: readFile("dist/bad-bundle.js"),
  emptyManifest: readFile("dist/empty-manifest.js")
};

const testOutputDir = path.resolve("test-output");

const NS_PER_SEC = 1e9;

describe("Smoke tests", () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

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
    beforeEach(function () {
      this.timeout(20000); // Extended timeout.
      return mkdirp(testOutputDir);
    });

    afterEach((done) => rimraf(testOutputDir, done));

    it("runs actions faster in the daemon with a cache", () => {
      const daemon = InspectpackDaemon.create({
        cache: Cache.create({
          filename: path.join(testOutputDir, ".inspectpack-test-cache.db")
        })
      });

      const cache = daemon._cache;
      sandbox.spy(cache, "get");

      // First verify CI environment _did_ install cache libs.
      expect(cache).to.be.an.instanceOf(SqliteCache);

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

          // Cache miss.
          expect(cache.get).to.have.callCount(1);
          expect(cache.get.returnValues[0]).to.equal(null);

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
          //
          // Using the following experimental times, we choose that the cache
          // scenario should be at least 10x faster.
          //
          // w/w/o db Cold        Hot       Diff
          // ======== =========== ========= =====
          // Without  1879945971  471404939 0.251
          //          1802303278  586886332 0.326
          //          1747124272  604059657 0.346
          //
          // With     1676902494    9998125 0.006
          //          2330906330    9696792 0.004
          //
          const speedup = coldTime / hotTime;
          expect(speedup).to.be.greaterThan(10);

          // Cache hit.
          expect(cache.get).to.have.callCount(2);
          expect(cache.get.returnValues[1])
            .to.be.an("object").and
            .to.have.keys("meta", "sizes");
        });
    });

    it("runs actions correctly in the daemon without a cache", () => {
      const daemon = InspectpackDaemon.create({
        cache: NoopCache.create()
      });
      const cache = daemon._cache;
      sandbox.spy(cache, "get");

      // Verify empty cache.
      expect(cache).to.be.an.instanceOf(NoopCache);

      return daemon.sizes({
        code: fixtures.badBundle,
        format: "object",
        minified: false,
        gzip: false
      })
        .then(() => {
          // Cache miss.
          expect(cache.get).to.have.callCount(1);
          expect(cache.get.returnValues[0]).to.equal(null);

          return daemon.sizes({
            code: fixtures.badBundle,
            format: "object",
            minified: false,
            gzip: false
          });
        })
        .then(() => {
          // Cache miss.
          expect(cache.get).to.have.callCount(2);
          expect(cache.get.returnValues[1]).to.equal(null);
        });
    });
  });
});
