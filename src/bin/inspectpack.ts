#!/usr/bin/env node

import { actions, IAction } from "../lib";
import { parse } from "./lib/args";

const main = () => Promise.resolve()
  // Parse arguments.
  .then(parse)
  // Create action.
  .then(({ action, format, stats, ignoredPackages, bail }) =>
    actions(action, { stats, ignoredPackages }).then((instance: IAction) =>
      // Render, report, and bail if configured.
      instance.template.render(format)
        .then((out?: string) => {
          // Report.
          console.log(out); // tslint:disable-line no-console

          // Don't bother checking if we aren't going to bail.
          if (!bail) { return Promise.resolve(); }

          // Check and bail if appropriate.
          return instance.shouldBail().then((shouldBail) => {
            if (shouldBail) {
              throw new Error(`Issues found in action: ${action}`);
            }
          });
        })
    )
  )
  .catch((err: Error) => {
    // Try to get full stack, then full string if not.
    console.error(err.stack || err.toString()); // tslint:disable-line no-console

    process.exit(1);
  });

if (require.main === module) {
  main();
}
