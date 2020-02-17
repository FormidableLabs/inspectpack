"use strict";

/**
 * An "all versions" webpack configuration.
 *
 * Example usage (make sure to be in project root):
 *
 * ```sh
 * $ export WEBPACK_VERSION=4; \
 *   WEBPACK_MODE=development \
 *   WEBPACK_CWD=../../test/fixtures/duplicates-esm \
 *   NODE_PATH="${PWD}/node_modules/webpack${WEBPACK_VERSION}/node_modules:${PWD}/node_modules" \
 *   node test/fixtures/packages/webpack.js \
 *     --config ../../test/fixtures/config/webpack.config.js
 * ```
 */
const { resolve } = require("path");
const { StatsWriterPlugin } = require("webpack-stats-plugin");

// We have to _build_ the plugin, so just skip if not available.
let DuplicatesPlugin;
try {
  // eslint-disable-next-line global-require,import/no-unresolved
  DuplicatesPlugin = require("../../../plugin").DuplicatesPlugin;
} catch (err) {
  if (err.code !== "MODULE_NOT_FOUND") {
    throw err;
  }
  // eslint-disable-next-line no-console
  console.log("DuplicatesPlugin not found/built. Skipping");
}

const mode = process.env.WEBPACK_MODE;
if (!mode) {
  throw new Error("WEBPACK_MODE is required");
}

const vers = process.env.WEBPACK_VERSION;
if (!vers) {
  throw new Error("WEBPACK_VERSION is required");
}

const cwd = process.env.WEBPACK_CWD;
if (!cwd) {
  throw new Error("WEBPACK_CWD is required");
}

const webpack4 = {
  mode,
  devtool: false,
  context: resolve(cwd),
  entry: {
    bundle: "./src/index.js"
  },
  output: {
    path: resolve(cwd, `dist-${mode}-${vers}`),
    pathinfo: mode !== "production",
    filename: "[name].js"
  },
  module: {
    rules: [
      {
        test: /\.txt$/,
        use: "raw-loader"
      },
      {
        test: /\.css$/,
        use: "css-loader"
      }
    ]
  },
  plugins: [
    new StatsWriterPlugin({
      fields: ["assets", "modules"]
    }),
    DuplicatesPlugin ? new DuplicatesPlugin({
      verbose: true,
      emitErrors: false
      // TODO: REMOVE
      // ignoredPackages: [
      //   "@scope/foo"
      // ]
    }) : null
  ].filter(Boolean)
};

const webpack1Module = {
  loaders: webpack4.module.rules.map((rule) => ({
    test: rule.test,
    loader: rule.use
  }))
};

const webpackOld = {
  devtool: webpack4.devtool,
  context: webpack4.context,
  entry: webpack4.entry,
  output: webpack4.output,
  // TODO(66): Add minify thing here -- mode === "production",
  // https://github.com/FormidableLabs/inspectpack/issues/66
  module: vers === "1" ? webpack1Module : webpack4.module,
  plugins: webpack4.plugins
};

// Choose appropriate version.
let config = vers === "4" ? webpack4 : webpackOld;

// Dynamically try to import a custom override from `CWD/webpack.config.js`
try {
  const webpack = require(`webpack${vers}/lib`); // eslint-disable-line global-require
  const override = require(resolve(cwd, "webpack.config.js")); // eslint-disable-line global-require
  config = override(webpack, config);
} catch (err) {
  if (err.code !== "MODULE_NOT_FOUND") {
    throw err;
  }
}

module.exports = config;
