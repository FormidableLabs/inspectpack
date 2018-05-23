

const { dirname } = require("path");

/**
 * Runtime switcher for all webpack versions.
 */
const vers = process.env.WEBPACK_VERSION;
if (!vers) {
  throw new Error("WEBPACK_VERSION is required");
}

// Change process directory to the actual install, so that node_modules
// resolution will use the nested stuff **first**.
process.chdir(dirname(require.resolve(`webpack${vers}/package.json`)));

// eslint-disable-next-line import/no-unresolved
module.exports = require(`webpack${vers}`);
