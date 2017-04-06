"use strict";

const crypto = require("crypto");
const tryRequire = require("try-require");

const farmhash = tryRequire("farmhash");

module.exports = function (item) {
  const hashee = typeof item === "string"
    ? item : JSON.stringify(item);

  return farmhash
    ? farmhash.hash64(hashee)
    : crypto.createHash("sha256")
       .update(hashee)
       .digest("hex");
};
