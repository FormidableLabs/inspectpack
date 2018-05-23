/* eslint-disable no-console*/

const { foo } = require("@scope/foo");
const { bike } = require("@scope/foo/bike");
const { usesFoo } = require("uses-foo");
const { unscopedFoo, deeperUnscopedFoo } = require("unscoped-foo");
const { flattenedFoo } = require("flattened-foo");

console.log("foo", foo());
console.log("foo/bike", bike());
console.log("usesFoo", usesFoo());
console.log("flattenedFoo", flattenedFoo());
console.log("unscopedFoo", unscopedFoo());
console.log("deeperUnscopedFoo", deeperUnscopedFoo());
