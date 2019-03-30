// Reproduction.
const { readFile } = require("fs");
const mock = require("mock-fs");
const { promisify } = require("util");

// Convert to promises for readability. Works the same with callbacks.
const readFileP = promisify(readFile);

const { DO_REAL_READFILE } = process.env;

(async () => {
  if (DO_REAL_READFILE === "true") {
      // TODO HERE: Merely adding a **real** `readFile` of the any file before
    // errors the latter one. Comment this out and test passes.
    // Uncomment and test hangs.
    const buf1 = await readFileP("package.json");
    console.log("TODO HERE 001", { data: buf1.toString() });
  }

  // Also, if no `mock()`, the two real readFile calls also succeed.
  mock({
    "package.json": "BAD_NOT_JSON",
  });

  const buf2 = await readFileP("package.json");
  console.log("TODO HERE 002", { data: buf2.toString() });
})();
