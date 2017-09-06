"use strict";

const fs = require("fs");
const path = require("path");
const expect = require("chai").expect;
const pify = require("pify");

const duplicates = pify(require("../lib/actions/duplicates"));
const pattern = pify(require("../lib/actions/pattern"));
const parse = pify(require("../lib/actions/parse"));
const files = pify(require("../lib/actions/files"));
const versions = pify(require("../lib/actions/versions"));
const sizes = pify(require("../lib/actions/sizes"));

const fixtureRoot = path.dirname(require.resolve("inspectpack-test-fixtures/package.json"));
const readFile = (relPath) => fs.readFileSync(path.join(fixtureRoot, relPath), "utf8");

const basicFixture = readFile("built/basic-lodash-object-expression.js");
const badBundleFixture = readFile("dist/bad-bundle.js");

describe("Smoke tests", () => {
  it("analyzes duplicates", () =>
    duplicates({
      code: badBundleFixture,
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
      code: badBundleFixture,
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
    })
      .then((result) => {
        expect(result).to.have.deep.property("meta.numMatches", 1);
      })
  );

  it("analyzes suspicious files", () =>
    files({
      code: badBundleFixture,
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
      code: badBundleFixture,
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
      code: badBundleFixture,
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
      code: basicFixture,
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

});
