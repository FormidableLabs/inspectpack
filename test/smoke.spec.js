"use strict";

const expect = require("chai").expect;
const fs = require("fs");

const duplicates = require("../lib/actions/duplicates");
const pattern = require("../lib/actions/pattern");
const parse = require("../lib/actions/parse");
const files = require("../lib/actions/files");
const versions = require("../lib/actions/versions");
const sizes = require("../lib/actions/sizes");

const EXTENDED_TIMEOUT = 15000;

const basicFixturePath = require.resolve(
  "inspectpack-test-fixtures/basic-lodash-object-expression"
);
const basicFixture = fs.readFileSync(basicFixturePath, "utf8");

const badBundleFixtureRoot = require
  .resolve("inspectpack-test-fixtures")
  .replace("/index.js", "");

const badBundleFixturePath = require.resolve(
  "inspectpack-test-fixtures/badBundle.js"
);

const badBundleFixture = fs.readFileSync(badBundleFixturePath, "utf8");

const checkForErrors = function (done, err, assertion) {
  if (err) { return done(err); }

  try {
    assertion();
    done();
  } catch (e) {
    done(e);
  }
};

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
      checkForErrors(done, err, () => {
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
      checkForErrors(done, err, () => {
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
      checkForErrors(done, err, () => {
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
      checkForErrors(done, err, () => {
        expect(result).to.have.deep.property("meta.numMatches", 5);
      });
    });
  });

  it("analyzes version skews", (done) => {
    versions({
      code: badBundleFixture,
      root: badBundleFixtureRoot,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      checkForErrors(done, err, () => {
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
      checkForErrors(done, err, () => {
        expect(result).to.have.property("sizes").with.lengthOf(4);
      });
    });
  });
});
