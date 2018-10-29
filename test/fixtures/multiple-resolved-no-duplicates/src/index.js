/* eslint-disable no-console*/

const { foo } = require("foo");
const { usesFoo } = require("uses-foo");
const { noDups } = require("no-duplicates");
const { usesNoDups } = require("uses-no-duplicates");
const { moreNoDups } = require("more-no-duplicates");

console.log("foo", foo());
console.log("uses-foo", usesFoo());
console.log("no-duplicates", noDups());
console.log("uses-no-duplicates", usesNoDups());
console.log("more-no-duplicates", moreNoDups());
