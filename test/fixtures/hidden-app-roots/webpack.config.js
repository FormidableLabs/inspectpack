/* globals __dirname */
const { resolve } = require("path");

module.exports = (webpack, config) => {
  if (webpack) {
    config.entry = {
      bundle: "./packages/hidden-app/src/index.js"
    };
    config.resolve = config.resolve || {};
    config.resolve.alias = Object.assign({}, config.resolve.alias, {
      package2: resolve(__dirname, "packages/package2")
    });
  }

  return config;
};
