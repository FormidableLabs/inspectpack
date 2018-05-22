/* eslint-disable no-console,promise/always-return*/

// Async code splitting.
import(/* webpackChunkName: "foo" */"foo")
  .then(({ foo }) => {
    console.log("foo", foo());
  })
  .catch((err) => {
    console.error(`foo error: ${err}`);
  });

import(/* webpackChunkName: "different-foo" */"different-foo")
  .then(({ differentFoo }) => {
    console.log("differentFoo", differentFoo());
  })
  .catch((err) => {
    console.error(`differentFoo error: ${err}`);
  });

import(/* webpackChunkName: "bar" */"bar")
  .then(({ bar }) => {
    console.log("bar", bar());
  })
  .catch((err) => {
    console.error(`bar error: ${err}`);
  });
