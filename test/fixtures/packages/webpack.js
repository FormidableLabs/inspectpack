const { dirname } = require("path");
const chalk = require("chalk");

/**
 * Runtime switcher for all webpack versions.
 */
const { log } = console;

const { WEBPACK_CWD, WEBPACK_MODE, WEBPACK_VERSION } = process.env;
if (!WEBPACK_VERSION) {
  throw new Error("WEBPACK_VERSION is required");
}

const fixture = `${WEBPACK_CWD}/dist-${WEBPACK_MODE}-${WEBPACK_VERSION}/bundle.js`;
log(chalk `\n[{green.bold Building fixture}] ${fixture}\n`);

// Change process directory to the actual install, so that node_modules
// resolution will use the nested stuff **first**.
process.chdir(dirname(require.resolve(`webpack${WEBPACK_VERSION}/package.json`)));

// eslint-disable-next-line import/no-unresolved
module.exports = require(`webpack${WEBPACK_VERSION}`);
