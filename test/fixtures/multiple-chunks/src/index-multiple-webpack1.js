/* eslint-disable no-console*/

// TODO: I think webpack1 has a bug with actually running this code. Runtime
// gets an error like:
//
// ```
// bundle-multiple.js:50 Uncaught TypeError: Cannot read property 'call' of undefined
//     at __webpack_require__ (bundle-multiple.js:50)
//     at __webpack_require__.e (bundle-multiple.js:107)
//     at webpackJsonpCallback (bundle-multiple.js:21)
//     at 2.2.js:1
// ```
//
// because the code looks like:
//
// ```js
// // Async code splitting.
// __webpack_require__.e/* nsure */(2, (require) => {
//   const { foo } = require("foo"/* SHOULD BE: 1*/);
//   console.log("foo", foo());
// });
//
// __webpack_require__.e/* nsure */(3, (require) => {
//   const { differentFoo } = require("different-foo"/* SHOULD BE: 2*/);
//   console.log("differentFoo", differentFoo());
// });
//
// __webpack_require__.e/* nsure */(4, (require) => {
//   const { bar } = require("bar"/* SHOULD BE: 5*/);
//   console.log("bar", bar());
// });
// ```

// Async code splitting.
require.ensure(["foo"], (require) => {
  const { foo } = require("foo");
  console.log("foo", foo());
}, "foo");

require.ensure(["different-foo"], (require) => {
  const { differentFoo } = require("different-foo");
  console.log("differentFoo", differentFoo());
}, "different-foo");

require.ensure(["bar"], (require) => {
  const { bar } = require("bar");
  console.log("bar", bar());
}, "bar");
