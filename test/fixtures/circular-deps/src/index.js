
/* eslint-disable no-console*/

const { bar } = require("bar");
const memoize = require("memoizee");
// const memoize = () => {};

const memoized = memoize(bar);

console.log("bar", bar());
console.log("memoized", memoized());
