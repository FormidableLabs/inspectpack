"use strict";

var webpack = require("webpack");

module.exports = {
  context: __dirname,
  entry: {
    app: "./index.js"
  },
  output: {
    pathinfo: true,
    filename: "[name].js"
  },
  plugins: [
    new webpack.optimize.DedupePlugin()
  ]
};
