
/* eslint-disable no-console*/
const crypto = require("crypto");

console.log(crypto.createHash("sha256").update("hello", "utf8").digest());
