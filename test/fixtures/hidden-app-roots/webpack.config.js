/* globals __dirname */
const { resolve } = require("path");

module.exports = (webpack, config) => {
  if (webpack) {
    config.entry = {
      bundle: "./packages/hidden-app/src/index.js"
    };
    config.resolve = config.resolve || {};
  }

  return config;
};
