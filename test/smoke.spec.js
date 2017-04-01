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

const checkForErrors = function (done, assertion) {
  try {
    assertion();
    done();
  } catch (e) {
    done(e);
  }
};

describe("Smoke tests", () => {
  it("analyzes duplicates", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    duplicates({
      code: badBundleFixture,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      if (err) { done(err); return; }
      checkForErrors(done, () => {
        expect(result.meta.numFilesWithDuplicates).to.equal(1);
      });
    });
  });

  it("analyzes suspicious patterns", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    pattern({
      code: badBundleFixture,
      suspectPatterns: true,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      if (err) { done(err); return; }
      checkForErrors(done, () => {
        expect(result.meta.numMatches).to.equal(2);
      });
    });
  });

  it("analyzes suspicious parses", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

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
      if (err) { done(err); return; }
      checkForErrors(done, () => {
        expect(result.meta.numMatches).to.equal(1);
      });
    });
  });

  it("analyzes suspicious files", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    files({
      code: badBundleFixture,
      suspectFiles: true,
      format: "object",
      minified: false,
      gzip: false

    }, (err, result) => {
      if (err) { done(err); return; }
      checkForErrors(done, () => {
        expect(result.meta.numMatches).to.equal(5);
      });
    });
  });

  it("analyzes version skews", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    versions({
      code: badBundleFixture,
      root: badBundleFixtureRoot,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      if (err) { done(err); return; }
      checkForErrors(done, () => {
        expect(result).to.have.property("versions");
      });
    });
  });

  it("analyzes bundle sizes", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    sizes({
      code: basicFixture,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      if (err) { done(err); return; }
      checkForErrors(done, () => {
        expect(result.sizes).to.have.lengthOf(4);
      });
    });
  });
});
