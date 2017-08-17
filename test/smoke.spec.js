"use strict";

const fs = require("fs");
const path = require("path");
const expect = require("chai").expect;

const duplicates = require("../lib/actions/duplicates");
const pattern = require("../lib/actions/pattern");
const parse = require("../lib/actions/parse");
const files = require("../lib/actions/files");
const versions = require("../lib/actions/versions");
const sizes = require("../lib/actions/sizes");

const EXTENDED_TIMEOUT = 15000;

const fixtureRoot = path.dirname(require.resolve("inspectpack-test-fixtures/package.json"));
const readFile = (relPath) => fs.readFileSync(path.join(fixtureRoot, relPath), "utf8");

const basicFixture = readFile("built/basic-lodash-object-expression.js");
const badBundleFixture = readFile("dist/bad-bundle.js");

const finishAsserts = require("./util").finishAsserts;

describe("Smoke tests", () => {
  before(function () {
    this.timeout(EXTENDED_TIMEOUT);
  });

  it("analyzes duplicates", (done) => {
    duplicates({
      code: badBundleFixture,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      finishAsserts(done, err, () => {
        expect(result).to.have.deep.property("meta.numFilesWithDuplicates", 1);
      });
    });
  });

  it("analyzes suspicious patterns", (done) => {
    pattern({
      code: badBundleFixture,
      suspectPatterns: true,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      finishAsserts(done, err, () => {
        expect(result).to.have.deep.property("meta.numMatches", 2);
      });
    });
  });

  it("analyzes suspicious parses", (done) => {
    parse({
      code: basicFixture,
      parseFns: {
        TEST_PARSE(src) {
          return src.indexOf("oh hai mark") !== -1;
        }
      },
      suspectParses: true,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      finishAsserts(done, err, () => {
        expect(result).to.have.deep.property("meta.numMatches", 1);
      });
    });
  });

  it("analyzes suspicious files", (done) => {
    files({
      code: badBundleFixture,
      suspectFiles: true,
      format: "object",
      minified: false,
      gzip: false

    }, (err, result) => {
      finishAsserts(done, err, () => {
        expect(result).to.have.deep.property("meta.numMatches", 5);
      });
    });
  });

  it("analyzes version skews", (done) => {
    versions({
      code: badBundleFixture,
      root: fixtureRoot,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      finishAsserts(done, err, () => {
        expect(result).to.have.property("versions");
      });
    });
  });

  it("analyzes bundle sizes in bad fixture", (done) => {
    sizes({
      code: badBundleFixture,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      finishAsserts(done, err, () => {
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
      });
    });
  });

  it("analyzes bundle sizes in basic fixture", (done) => {
    sizes({
      code: basicFixture,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      finishAsserts(done, err, () => {
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
      });
    });
  });
});
