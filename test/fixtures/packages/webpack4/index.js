

if (process.env.DEBUG) {
  // eslint-disable-next-line no-console
  console.log(`webpack version: ${require("webpack/package.json").version}`);
}

// webpack4 is an `optionalDependencies` and only supported on node6.
// Skip the build if it fails to install.
try {
  // eslint-disable-next-line import/no-unresolved,global-require
  module.exports = require("webpack-cli/bin/webpack");
} catch (err) {
  if (err.code === "MODULE_NOT_FOUND") {
    console.log("skipping webpack4"); // eslint-disable-line no-console
    module.exports = null;
  } else {
    throw err;
  }
}
