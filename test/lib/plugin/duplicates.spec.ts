import * as mock from "mock-fs";
import * as sinon from "sinon";

describe("plugin/duplicates", () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
    mock.restore();
  });

  describe("#_getDuplicatesVersionsData", () => {
    it("TODO_NEEDS_TESTS");
  });

  describe("TODO_THE_REST", () => {
    it("TODO_NEEDS_TESTS");
  });
});
