"use strict";

/**
 * Tests using `formidable-playbook` fixtures.
 */
const fs = require("fs");
const path = require("path");
const expect = require("chai").expect;

const sizes = require("../lib/actions/sizes");

const finishAsserts = require("./util").finishAsserts;

const EXTENDED_TIMEOUT = 15000;

const fixtureRoot = path.dirname(require.resolve("formidable-playbook/package.json"));
const readFile = (relPath) => fs.readFileSync(path.join(fixtureRoot, relPath), "utf8");

describe("playbook", () => {
  let fixtures;

  before(function () {
    this.timeout(EXTENDED_TIMEOUT);

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
    }, (err, result) => {
      expect(err)
        .to.be.ok.and
        .to.have.property("message")
          .that.contains("No code sections found");

      done();
    });
  });


});