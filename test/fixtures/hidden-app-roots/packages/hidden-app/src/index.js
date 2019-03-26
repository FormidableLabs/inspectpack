/* eslint-disable no-console*/

// both packages are flattened into root `node_modules`.
const { foo } = require("foo");
const { differentFoo } = require("different-foo");

console.log("foo", foo());
console.log("differentFoo", differentFoo());
