/* eslint-disable no-console*/

// Aliased in with webpack config.
const { foo1 } = require("package1"); // eslint-disable-line import/no-unresolved
const { foo2 } = require("package2"); // eslint-disable-line import/no-unresolved
const { differentFoo } = require("different-foo");

console.log("foo1", foo1());
console.log("foo2", foo2());
console.log("differentFoo", differentFoo());
