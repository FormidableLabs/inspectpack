if (process.env.DEBUG) {
  // eslint-disable-next-line no-console
  console.log(`webpack version: ${require("webpack/package.json").version}`);
}

// eslint-disable-next-line import/no-unresolved
module.exports = require("webpack/bin/webpack");
