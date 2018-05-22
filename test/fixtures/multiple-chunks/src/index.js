/* eslint-disable no-console*/
const { foo } = require("foo");
const { differentFoo } = require("different-foo");
const { bar } = require("bar");

console.log("foo", foo());
console.log("differentFoo", differentFoo());
console.log("bar", bar());
