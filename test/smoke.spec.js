"use strict";

var expect = require("chai").expect;
var path = require("path");
var fs = require("fs");

var duplicates = require("../lib/actions/duplicates");
var pattern = require("../lib/actions/pattern");
var parse = require("../lib/actions/parse");
var files = require("../lib/actions/files");
var versions = require("../lib/actions/versions");
var sizes = require("../lib/actions/sizes");

var EXTENDED_TIMEOUT = 12000;

var basicFixturePath = path.resolve(__dirname, "fixtures/basic-lodash-object-expression.js");
var basicFixture = fs.readFileSync(basicFixturePath, "utf8");

var badBundleFixturePath = path.resolve(__dirname, "fixtures/bad-bundle/app.js");
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
  it.skip("analyzes duplicates", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    duplicates({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, done);
  });

  it("analyzes suspicious patterns", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    pattern({
      code: badBundleFixture,
      suspectPatterns: true,
      format: "json",
      minified: true,
      gzip: true
    }, function (err, result) {
      if (err) { done(err); }
      checkForErrors(done, function () {
        expect(result).to.be.truthy;
        expect(JSON.parse(result).meta.numMatches).to.equal(1);
      });
    });
  });

  it.skip("analyzes suspicious parses", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    parse({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, done);
  });

  it("analyzes suspicious files", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    files({
      code: badBundleFixture,
      suspectFiles: true,
      format: "json",
      minified: true,
      gzip: true
    }, function (err, result) {
      if (err) { done(err); }
      checkForErrors(done, function () {
        expect(result).to.be.truthy;
        expect(JSON.parse(result).meta.numMatches).to.equal(3);
      });
    });
  });

  it.skip("analyzes version skews", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    versions({
      code: badBundleFixture,
      root: process.cwd(),
      format: "json",
      minified: true,
      gzip: true
    }, done);
  });

  it("analyzes bundle sizes", function (done) {
    this.timeout(EXTENDED_TIMEOUT);

    sizes({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, function (err, json) {
      if (err) { done(err); }
      checkForErrors(done, function () {
        expect(json).to.be.truthy;
        var result = JSON.parse(json);
        expect(result.sizes).to.have.lengthOf(4);
      });
    });
  });
});
