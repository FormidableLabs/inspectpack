"use strict";

const fs = require("fs");
const path = require("path");
const pify = require("pify");
const Benchmark = require("benchmark");
const benchmarks = require("beautify-benchmark");
const suite = new Benchmark.Suite();

const actions = require("../lib/actions");
const Compressor = require("../lib/utils/compressor");

const badBundleFixtureRoot = path.dirname(
  require.resolve("inspectpack-test-fixtures/package.json")
);

const badBundleFixturePath = require.resolve(
  "inspectpack-test-fixtures/badBundle.js"
);

const badBundleFixture = fs.readFileSync(badBundleFixturePath, "utf8");

const opts = compressor => ({
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
  },
  compressor
});

Object.keys(actions.ACTIONS).forEach(action => {
  const actionFn = actions.ACTIONS[action];

  [true, false].forEach(usePuglify =>
    suite.add(`${action} (using puglify: ${usePuglify})`, {
      defer: true,
      fn: deferred => {
        const compressor = new Compressor({ usePuglify });
        actionFn(opts(compressor, usePuglify), err => {
          if (err) { throw err; }
          compressor.destroy();
          deferred.resolve();
        });
      }
    })
  );
}, {});

[true, false].forEach(usePuglify =>
  suite.add("all actions", {
    defer: true,
    fn: deferred => {
      const compressor = new Compressor({ usePuglify });
      return Promise.all(
        Object.keys(actions.ACTIONS).map(action => {
          return pify(actions.ACTIONS[action])(opts(compressor));
        })
      )
        .then(() => deferred.resolve())
        // eslint-disable-next-line no-console
        .catch(err => console.log(err))
        .then(() => compressor.destroy());
    }
  })
);

suite
  .on("cycle", event => {
    benchmarks.add(event.target);
  })
  .on("complete", () => {
    benchmarks.log();
  })
  .run({ "async": true });
