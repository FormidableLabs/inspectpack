"use strict";

/**
 * Tests using `formidable-playbook` fixtures.
 */
const fs = require("fs");
const path = require("path");
const expect = require("chai").expect;

const sizes = require("../lib/actions/sizes");

const finishAsserts = require("./util").finishAsserts;

const fixtureRoot = path.dirname(require.resolve("formidable-playbook/package.json"));
const readFile = (relPath) => fs.readFileSync(path.join(fixtureRoot, relPath), "utf8");

describe("Playbook", () => {
  let fixtures;

  before(() => {
    fixtures = {
      codeSplittingEnsure: [
        "0",
        "1",
        "2",
        "entry"
      ].reduce((m, k) => Object.assign(m, {
        [k]: readFile(`examples/frontend/webpack-code-splitting-ensure/dist/js/${k}.js`)
      }), {}),
      codeSplitting: [
        "app1",
        "app2",
        "commons"
      ].reduce((m, k) => Object.assign(m, {
        [k]: readFile(`examples/frontend/webpack-code-splitting/dist/js/${k}.js`)
      }), {}),
      sharedLibs: [
        "app1",
        "app2",
        "lib"
      ].reduce((m, k) => Object.assign(m, {
        [k]: readFile(`examples/frontend/webpack-shared-libs/dist/js/${k}.js`)
      }), {}),
      // Minified, no pathinfo
      sourceMaps: [
        "app1",
        "app2"
      ].reduce((m, k) => Object.assign(m, {
        [k]: readFile(`examples/frontend/webpack-source-maps/dist/js/${k}.js`)
      }), {}),
      treeShaking: [
        "app1",
        "app2"
      ].reduce((m, k) => Object.assign(m, {
        [k]: readFile(`examples/frontend/webpack-tree-shaking/dist/js/${k}.js`)
      }), {})
    };
  });

  it("throws on no code found / minified / no pathinfo", (done) => {
    sizes({
      code: fixtures.sourceMaps.app1,
      format: "object",
      minified: false,
      gzip: false
    }, (err) => {
      expect(err)
        .to.be.ok.and
        .to.have.property("message")
          .that.contains("No code sections found");

      done();
    });
  });

  it("allows empty bundles with flag", (done) => {
    sizes({
      code: fixtures.sourceMaps.app1,
      allowEmpty: true,
      format: "object",
      minified: false,
      gzip: false
    }, (err, result) => {
      finishAsserts(done, err, () => {
        expect(result).to.have.property("sizes").that.has.lengthOf(0);
      });
    });
  });

  describe("dll / shared libs", () => {
    it("parses shared libraries", (done) => {
      sizes({
        code: fixtures.sharedLibs.lib,
        format: "object",
        minified: false,
        gzip: false
      }, (err, result) => {
        finishAsserts(done, err, () => {
          expect(result).to.have.property("sizes").that.has.lengthOf(3);

          const codes = result.sizes;
          expect(codes[0]).to.have.property("id", "0");
          expect(codes[0]).to.have.property("fileName", "dll lib");
          expect(codes[0]).to.have.property("type", "code");

          expect(codes[1]).to.have.property("id", "1");
          expect(codes[1]).to.have.property("fileName", "./lib.js");
          expect(codes[1]).to.have.property("type", "code");

          expect(codes[2]).to.have.property("id", "2");
          expect(codes[2]).to.have.property("fileName", "./foo.js");
          expect(codes[2]).to.have.property("type", "code");
        });
      });
    });

    // TODO(RYAN): Update fileName for delegated file reference?
    // - https://github.com/FormidableLabs/inspectpack/issues/36
    // - https://github.com/FormidableLabs/inspectpack/issues/37
    it("parses consuming bundles", (done) => {
      sizes({
        code: fixtures.sharedLibs.app1,
        format: "object",
        minified: false,
        gzip: false
      }, (err, result) => {
        finishAsserts(done, err, () => {
          expect(result).to.have.property("sizes").that.has.lengthOf(3);

          const codes = result.sizes;
          expect(codes[0]).to.have.property("id", "0");
          expect(codes[0]).to.have.property("fileName",
            "delegated ./foo.js from dll-reference lib_00d73d25eef8ddd2ed11");
          expect(codes[0]).to.have.property("type", "code");

          expect(codes[1]).to.have.property("id", "1");
          expect(codes[1]).to.have.property("fileName", "external \"lib_00d73d25eef8ddd2ed11\"");
          expect(codes[1]).to.have.property("type", "code");

          expect(codes[2]).to.have.property("id", "2");
          expect(codes[2]).to.have.property("fileName", "./app1.js");
          expect(codes[2]).to.have.property("type", "code");
        });
      });
    });
  });
});
