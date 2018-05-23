/* eslint-disable no-console*/

const { foo } = require("foo");
const { bike } = require("foo/bike");
const { usesFoo } = require("uses-foo");
const { differentFoo } = require("different-foo");
const { flattenedFoo } = require("flattened-foo");

console.log("foo", foo());
console.log("foo/bike", bike());
console.log("usesFoo", usesFoo());
console.log("differentFoo", differentFoo());
console.log("flattenedFoo", flattenedFoo());
