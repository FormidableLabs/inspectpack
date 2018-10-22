/* eslint-disable no-console*/

const { noDups } = require("no-duplicates");
const { usesNoDups } = require("uses-no-duplicates");
const { moreNoDups } = require("more-no-duplicates");

console.log("no-duplicates", noDups());
console.log("uses-no-duplicates", usesNoDups());
console.log("more-no-duplicates", moreNoDups());
