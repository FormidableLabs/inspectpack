"use strict";

const crypto = require("crypto");

let farmhash;
try {
  // eslint-disable-next-line global-require
  farmhash = require("farmhash");
} catch (err) {
  farmhash = null;
}

module.exports = function (item) {
  const hashee = typeof item === "string"
    ? item : JSON.stringify(item);

  return farmhash
    ? farmhash.hash64(hashee)
    : crypto.createHash("sha256")
       .update(hashee)
       .digest("hex");
};
