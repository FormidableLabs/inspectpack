"use strict";

/**
 * A helper for webpack-dashboard to be able to use any test scenarios.
 * (Not specifically used _within_ this project.)
 *
 * Example usage:
 *
 * ```sh
 * # Remove `webpack` from `webpack-dashboard` to force our version.
 * $ cd webpack-dashboard
 * $ mv node_modules/webpack node_modules/webpack_DISABLED
 *
 * # Switch to `inspectpack` directory.
 * $ cd ../inspectpack
 *
 * # Now you can use these environment variables to swap scenarios, webpack
 * # versions, etc.
 * # Note: `WEBPACK_DASHBOARD_PORT` needs env var and separate number on CLI.
 * $ WEBPACK_VERSION=3 \
 *   WEBPACK_MODE=development \
 *   WEBPACK_CWD=../../test/fixtures/multiple-chunks \
 *   WEBPACK_DASHBOARD_PATH="${PWD}/.." \
 *   WEBPACK_DASHBOARD_PORT=9003 \
 *   NODE_PATH="${PWD}/node_modules/webpack${WEBPACK_VERSION}/node_modules" \
 *   node "${PWD}/../webpack-dashboard/bin/webpack-dashboard.js" -p 9003 -- \
 *   node test/fixtures/packages/webpack.js \
 *     --config "${PWD}/test/fixtures/config/webpack.config.webpack-dashboard.js" \
 *     --watch
 * ```
 */
const { resolve } = require("path");

const { WEBPACK_DASHBOARD_PATH, WEBPACK_DASHBOARD_PORT } = process.env;
const dbPath = WEBPACK_DASHBOARD_PATH ? `${resolve(WEBPACK_DASHBOARD_PATH)}/` : "";

const Dashboard = require(`${dbPath}webpack-dashboard/plugin`);
const config = require("./webpack.config");

module.exports = Object.assign({}, config, {
  // Overwrite existing plugins (e.g. stats plugin) with dashboard.
  plugins: [
    new Dashboard({
      port: WEBPACK_DASHBOARD_PORT ? parseInt(WEBPACK_DASHBOARD_PORT) : null
    })
  ]
});
