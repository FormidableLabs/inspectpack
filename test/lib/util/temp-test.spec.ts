// TODO REMOVE
const { readFile } = require("fs");
const mock = require("mock-fs");
const { promisify } = require("util");

const readFileP = promisify(readFile);

describe.only("mock-fs temp test suite", () => {
  afterEach(() => {
    mock.restore();
  });

  it("read a package.json", async () => {
    // TODO HERE: Merely adding a **real** `readFile` of the any file before
    // errors the latter one. Comment this out and test passes.
    // Uncomment and test hangs.
    const buf1 = await readFileP("test/fixtures/duplicates-cjs/package.json");
    console.log("TODO HERE 001", { data: buf1.toString() });

    mock({
      "test/fixtures/duplicates-cjs": {
        "package.json": "BAD_NOT_JSON",
      },
    });

    const buf2 = await readFileP("test/fixtures/duplicates-cjs/package.json");
    console.log("TODO HERE 002", { data: buf2.toString() });
  });
});
