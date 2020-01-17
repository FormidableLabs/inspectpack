
/* eslint-disable no-console*/

const { bar } = require("bar");
const memoize = require("memoizee");

const memoized = memoize(bar);

console.log("bar", bar());
console.log("memoized", memoized());
