"use strict";

/**
 * Tests using `formidable-playbook` fixtures.
 */
const fs = require("fs");
const path = require("path");
const expect = require("chai").expect;
const pify = require("pify");

const sizes = pify(require("../lib/actions/sizes"));

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
      scopeHoisting: [
        "app3",
        "app3.nohoist"
      ].reduce((m, k) => Object.assign(m, {
        [k]: readFile(`examples/frontend/webpack-scope-hoisting/dist/js/${k}.js`)
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

  it("throws on no code found / minified / no pathinfo", () =>
    sizes({
      code: fixtures.sourceMaps.app1,
      format: "object",
      minified: false,
      gzip: false
    })
      .then(() => {
        throw new Error("Should have errored");
      })
      .catch((err) => {
        expect(err)
          .to.be.ok.and
          .to.have.property("message")
            .that.contains("No code sections found");
      })
  );

  it("allows empty bundles with flag", () =>
    sizes({
      code: fixtures.sourceMaps.app1,
      allowEmpty: true,
      format: "object",
      minified: false,
      gzip: false
    })
      .then((result) => {
        expect(result).to.have.property("sizes").that.has.lengthOf(0);
      })
  );

  describe("code splitting ensure", () => {
    it("parses all bundle parts", () => {
      const ensureSizes = (name) => sizes({
        code: fixtures.codeSplittingEnsure[name],
        format: "object",
        minified: false,
        gzip: false
      });

      return Promise.all([
        ensureSizes("0")
          .then((result) => {
            expect(result).to.have.property("sizes").that.has.lengthOf(1);

            const codes = result.sizes;
            expect(codes[0]).to.have.property("id", "3");
            expect(codes[0]).to.have.property("fileName", "./foo.js");
            expect(codes[0]).to.have.property("type", "code");
          }),

        ensureSizes("1")
          .then((result) => {
            expect(result).to.have.property("sizes").that.has.lengthOf(1);

            const codes = result.sizes;
            expect(codes[0]).to.have.property("id", "1");
            expect(codes[0]).to.have.property("fileName", "./app2.js");
            expect(codes[0]).to.have.property("type", "code");
          }),

        ensureSizes("2")
          .then((result) => {
            expect(result).to.have.property("sizes").that.has.lengthOf(1);

            const codes = result.sizes;
            expect(codes[0]).to.have.property("id", "0");
            expect(codes[0]).to.have.property("fileName", "./app1.js");
            expect(codes[0]).to.have.property("type", "code");
          }),

        ensureSizes("entry")
          .then((result) => {
            expect(result).to.have.property("sizes").that.has.lengthOf(1);

            const codes = result.sizes;
            expect(codes[0]).to.have.property("id", "2");
            expect(codes[0]).to.have.property("fileName").that.contains("entry.js");
            expect(codes[0]).to.have.property("type", "code");
          })
      ]);
    });
  });

  describe.only("scope hoisting", () => {
    it("parses all bundle parts", () =>
      Promise.all([
        sizes({
          code: fixtures.scopeHoisting.app3,
          format: "object",
          minified: false,
          gzip: false
        }),

        sizes({
          code: fixtures.scopeHoisting["app3.nohoist"],
          format: "object",
          minified: false,
          gzip: false
        })
      ])

        .then((results) => {
          const hoist = results[0];
          const nohoist = results[1];
          let codes;

          // Baseline (nohoist)
          expect(nohoist).to.have.property("sizes").that.has.lengthOf(4);

          codes = nohoist.sizes;
          expect(codes[0]).to.have.property("fileName", "./app3.js");
          expect(codes[1]).to.have.property("fileName", "./util-2.js");
          expect(codes[2]).to.have.property("fileName", "./util-1.js");
          expect(codes[3]).to.have.property("fileName", "./util.js");

          // TODO: HERE - Update for scope hoisting.
          // - filename " + 1 modules"
          // - ???
          expect(hoist).to.have.property("sizes").that.has.lengthOf(4);

          codes = hoist.sizes;
          expect(codes[0]).to.have.property("id", "0");
          expect(codes[0]).to.have.property("fileName", "./app3.js");
          expect(codes[0]).to.have.property("type", "code");
        })
    );
  });

  describe("dll / shared libs", () => {
    it("parses shared libraries", () =>
      sizes({
        code: fixtures.sharedLibs.lib,
        format: "object",
        minified: false,
        gzip: false
      })
        .then((result) => {
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
        })
    );

    // TODO(RYAN): Update fileName for delegated file reference?
    // - https://github.com/FormidableLabs/inspectpack/issues/36
    // - https://github.com/FormidableLabs/inspectpack/issues/37
    it("parses consuming bundles", () =>
      sizes({
        code: fixtures.sharedLibs.app1,
        format: "object",
        minified: false,
        gzip: false
      })
        .then((result) => {
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
        })
    );

  });
});
