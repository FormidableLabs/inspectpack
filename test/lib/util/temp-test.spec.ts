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
    // errors the latter one.
    //const { data1 } = await readFileP("test/fixtures/duplicates-cjs/package.json");
    //console.log("TODO HERE 001", { data1 });

    mock({
      "test/fixtures/duplicates-cjs": {
        "package.json": "BAD_NOT_JSON", // TODO DOESN'T HANG IF COMMENTED
      },
    });

    const { data2 } = await readFileP("test/fixtures/duplicates-cjs/package.json");
    console.log("TODO HERE 002", { data2 });
  });
});
