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

  it("analyzes bundle sizes", (done) => {
    sizes({
      code: basicFixture,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      finishAsserts(done, err, () => {
        expect(result).to.have.property("sizes").with.lengthOf(4);
      });
    });
  });
});
