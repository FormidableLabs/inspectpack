"use strict";

var expect = require("chai").expect;
var fs = require("fs");

var duplicates = require("../lib/actions/duplicates");
var pattern = require("../lib/actions/pattern");
var parse = require("../lib/actions/parse");
var files = require("../lib/actions/files");
var versions = require("../lib/actions/versions");
var sizes = require("../lib/actions/sizes");

var EXTENDED_TIMEOUT = 15000;

var basicFixturePath = require.resolve(
  "inspectpack-test-fixtures/basic-lodash-object-expression"
);
var basicFixture = fs.readFileSync(basicFixturePath, "utf8");

var badBundleFixtureRoot = require
  .resolve("inspectpack-test-fixtures")
  .replace("/index.js", "");

var badBundleFixturePath = require.resolve(
  "inspectpack-test-fixtures/badBundle.js"
);

var badBundleFixture = fs.readFileSync(badBundleFixturePath, "utf8");

var checkForErrors = function (done, assertion) {
  try {
    assertion();
    done();
  } catch (e) {
    done(e);
  }
};

describe("Smoke tests", function () {
  it("analyzes duplicates", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    duplicates({
      code: badBundleFixture,
      format: "object",
      minified: false,
      gzip: false
    }, function (err, result) {
      if (err) { done(err); return; }
      checkForErrors(done, function () {
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
    }, function (err, result) {
      if (err) { done(err); return; }
      checkForErrors(done, function () {
        expect(result.meta.numMatches).to.equal(2);
      });
    });
  });

  it("analyzes suspicious parses", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    parse({
      code: basicFixture,
      parseFns: {
        TEST_PARSE: function (src) {
          return src.indexOf("oh hai mark") !== -1;
        }
      },
      suspectParses: true,
      format: "object",
      minified: false,
      gzip: false
    }, function (err, result) {
      if (err) { done(err); return; }
      checkForErrors(done, function () {
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
    }, function (err, result) {
      if (err) { done(err); return; }
      checkForErrors(done, function () {
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
    }, function (err, result) {
      if (err) { done(err); return; }
      checkForErrors(done, function () {
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
    }, function (err, result) {
      if (err) { done(err); return; }
      checkForErrors(done, function () {
        expect(result.sizes).to.have.lengthOf(4);
      });
    });
  });
});
