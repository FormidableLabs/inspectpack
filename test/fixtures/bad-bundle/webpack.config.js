"use strict";

var webpack = require("webpack");

module.exports = {
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
