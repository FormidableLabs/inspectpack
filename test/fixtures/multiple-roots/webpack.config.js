/* globals __dirname */
const { resolve } = require("path");

module.exports = (webpack, config) => {
  if (webpack) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      package1: resolve(__dirname, "packages/package1"),
      package2: resolve(__dirname, "packages/package2")
    };
  }

  return config;
};
