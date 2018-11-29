#!/usr/bin/env node

import { render } from "../lib";
import { parse } from "./lib/args";

const main = () => Promise.resolve()
  // Parse arguments.
  .then(parse)
  // Create, validate, and run the action.
  .then(render)
  // Output or errors...
  .then((out?: string) => {
    console.log(out); // tslint:disable-line no-console
  })
  .catch((err: Error) => {
    // Try to get full stack, then full string if not.
    console.error(err.stack || err.toString()); // tslint:disable-line no-console

    process.exit(1);
  });

if (require.main === module) {
  main();
}
