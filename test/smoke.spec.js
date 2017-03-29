"use strict";
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

describe("Smoke tests", function () {
  it.only("analyzes duplicates", function (done) {
    duplicates({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, function (err, result) {
      // console.log(result);
      done();
    });
  }).timeout(EXTENDED_TIMEOUT);

  it("analyzes duplicates", function (done) {
    duplicates({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, done);
  }).timeout(EXTENDED_TIMEOUT);

  it("analyzes suspicious patterns", function (done) {
    pattern({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, done);
  }).timeout(EXTENDED_TIMEOUT);

  it("analyzes suspicious parses", function (done) {
    parse({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, done);
  }).timeout(EXTENDED_TIMEOUT);

  it("analyzes suspicious files", function (done) {
    files({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, done);
  }).timeout(EXTENDED_TIMEOUT);

  it("analyzes version skews", function (done) {
    versions({
      code: basicFixture,
      root: process.cwd(),
      format: "json",
      minified: true,
      gzip: true
    }, done);
  }).timeout(EXTENDED_TIMEOUT);

  it("analyzes bundle sizes", function (done) {
    sizes({
      code: basicFixture,
      format: "json",
      minified: true,
      gzip: true
    }, done);
  }).timeout(EXTENDED_TIMEOUT);
});
