"use strict";

const fs = require("fs");
const path = require("path");
const pify = require("pify");
const Benchmark = require("benchmark");
const benchmarks = require("beautify-benchmark");
const suite = new Benchmark.Suite();

const actions = require("../lib/actions");

const badBundleFixtureRoot = path.dirname(
  require.resolve("inspectpack-test-fixtures/package.json")
);

const badBundleFixturePath = require.resolve(
  "inspectpack-test-fixtures/badBundle.js"
);

const badBundleFixture = fs.readFileSync(badBundleFixturePath, "utf8");

const opts = {
  code: badBundleFixture,
  format: "object",
  minified: true,
  gzip: true,
  root: badBundleFixtureRoot,
  suspectFiles: true,
  suspectPatterns: true,
  parseFns: {
    TEST_PARSE(src) {
      return src.indexOf("oh hai mark") !== -1;
    }
  }
};

Object.keys(actions.ACTIONS).forEach(action => {
  const actionFn = actions.ACTIONS[action];

  suite.add(action, {
    defer: true,
    fn: deferred => {
      actionFn(opts, err => {
        if (err) { throw err; }
        deferred.resolve();
      });
    }
  });
}, {});

suite.add("all actions", {
  defer: true,
  fn: deferred => Promise.all(
    Object.keys(actions.ACTIONS).map(action => {
      return pify(actions.ACTIONS[action])(opts);
    })
  )
    .then(() => deferred.resolve())
    // eslint-disable-next-line no-console
    .catch(err => console.log(err))
});

suite
  .on("cycle", event => {
    benchmarks.add(event.target);
  })
  .on("complete", () => {
    benchmarks.log();
  })
  .run({ "async": true });
