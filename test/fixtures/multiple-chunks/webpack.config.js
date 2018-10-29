/* globals __dirname */

module.exports = (webpack, config) => {
  if (webpack) {
    const vers = process.env.WEBPACK_VERSION;
    const isWebpack1 = vers === "1";

    // Add multiple entries.
    config.entry = Object.assign({}, config.entry, {
      // webpack1 supports `require.ensure`, not `import`. Use a different
      // entry point.
      "bundle-multiple": isWebpack1
        ? "./src/index-multiple-webpack1.js"
        : "./src/index-multiple.js",
      "bundle-different": "./src/index-different.js"
    });

    // Set a public path so chunks can dynamically load correctly.
    // Note that we're using `file://` pathing, which means you should open
    // this directly from your local filesystem.
    config.output.publicPath = `file://${__dirname}/dist-development-${vers}/`;

    // Add sourcemaps too to make sure we're _skipping_ these in lib.
    config.devtool = "source-map";
  }

  return config;
};
