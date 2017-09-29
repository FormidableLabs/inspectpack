"use strict";

const crypto = require("crypto");

let farmhash;
try {
  farmhash = require("farmhash"); // eslint-disable-line global-require
} catch (err) { /* passthrough */ }

module.exports = function (item) {
  const hashee = typeof item === "string" ? item : JSON.stringify(item);

  return farmhash
    ? farmhash.hash64(hashee)
    : crypto.createHash("sha256")
       .update(hashee)
       .digest("hex");
};
