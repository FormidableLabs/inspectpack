/* global __dirname:false */

const { stat } = require("fs");
const { resolve, join } = require("path");

const chalk = require("chalk");
const pify = require("pify");

/**
 * Check that bundle was actually built
 */
const { log } = console;
const statP = pify(stat);

const exists = (filePath) => statP(filePath)
  .then(() => true)
  .catch((err) => {
    if (err.code === "ENOENT") { return false; } // Not found.
    throw err; // Rethrow real error.
  });

const { WEBPACK_CWD, WEBPACK_MODE, WEBPACK_VERSION } = process.env;
if (!WEBPACK_VERSION) {
  throw new Error("WEBPACK_VERSION is required");
}

const main = () => {
  const fixture = `${WEBPACK_CWD}/dist-${WEBPACK_MODE}-${WEBPACK_VERSION}/bundle.js`;
  log(chalk `\n[{yellow.bold Checking fixture}] ${fixture}\n`);

  const fixturePath = resolve(join(__dirname, ".."), fixture);
  return exists(fixturePath)
    .then((fixtureExists) => {
      if (!fixtureExists) { // eslint-disable-line promise/always-return
        throw new Error(`${fixturePath} was not built.`);
      }
    });
};

main()
  .catch((err) => {
    log(chalk `\n[{red.bold Missing fixture}] ${err.message}\n`);
    process.exit(1);
  });
