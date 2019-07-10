

if (process.env.DEBUG) {
  // eslint-disable-next-line no-console
  console.log(`webpack version: ${require("webpack/package.json").version}`);
}

module.exports = require("webpack-cli/bin/cli");
