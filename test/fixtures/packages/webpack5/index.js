

if (process.env.DEBUG) {
  // eslint-disable-next-line no-console
  console.log(`webpack version: ${require("webpack/package.json").version}`);
}

// Note: Different than previous versions of webpack-cli.
// eslint-disable-next-line import/no-unresolved
module.exports = require("webpack-cli/bin/cli.js");
