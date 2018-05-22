"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../lib");
const args_1 = require("./lib/args");
const main = () => Promise.resolve()
    // Parse arguments.
    .then(args_1.parse)
    // Create, validate, and run the action.
    .then(lib_1.render)
    // Output or errors...
    .then((out) => {
    console.log(out); // tslint:disable-line no-console
})
    .catch((err) => {
    // Try to get full stack, then full string if not.
    console.error(err.stack || err.toString()); // tslint:disable-line no-console
    process.exit(1);
});
if (require.main === module) {
    main();
}
