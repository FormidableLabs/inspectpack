"use strict";

/**
 * An "all versions" webpack configuration.
 *
 * Example usage (make sure to be in project root):
 *
 * ```sh
 * $ export WEBPACK_VERSION=5; \
 *   WEBPACK_MODE=development \
 *   WEBPACK_CWD=../../test/fixtures/hidden-app-roots \
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
const versNum = parseInt(vers, 10);

const cwd = process.env.WEBPACK_CWD;
if (!cwd) {
  throw new Error("WEBPACK_CWD is required");
}

const outputPath = resolve(cwd, `dist-${mode}-${vers}`);

// Webpack 4+
let configModern = {
  mode,
  devtool: false,
  context: resolve(cwd),
  entry: {
    bundle: "./src/index.js"
  },
  output: {
    path: outputPath,
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
      fields: ["assets", "modules"],
      stats: {
        source: true // Needed for webpack5+
      }
    }),
    DuplicatesPlugin ? new DuplicatesPlugin({
      verbose: true,
      emitErrors: false
    }) : null
  ].filter(Boolean)
};

// Dynamically try to import a custom override from `CWD/webpack.config.js`
try {
  const webpack = require(`webpack${vers}/lib`); // eslint-disable-line global-require
  const override = require(resolve(cwd, "webpack.config.js")); // eslint-disable-line global-require
  configModern = override(webpack, configModern, versNum);
} catch (err) {
  if (err.code !== "MODULE_NOT_FOUND") {
    throw err;
  }
}

const webpack1Module = {
  loaders: configModern.module.rules.map((rule) => ({
    test: rule.test,
    loader: rule.use
  }))
};

// Webpack 2-3
const configLegacy = {
  devtool: configModern.devtool,
  context: configModern.context,
  entry: configModern.entry,
  output: configModern.output,
  // TODO(66): Add minify thing here -- mode === "production",
  // https://github.com/FormidableLabs/inspectpack/issues/66
  module: versNum === 1 ? webpack1Module : configModern.module,
  plugins: configModern.plugins,
  resolve: configModern.resolve
};

// Choose appropriate version.
// eslint-disable-next-line no-magic-numbers
const config = versNum >= 4 ? configModern : configLegacy;

module.exports = config;
