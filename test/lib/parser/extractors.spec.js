"use strict";

const expect = require("chai").expect;
const extractors = require("../../../lib/parser/extractors");

describe("lib/parser/extractors", () => {
  describe("#getFileName", () => {
    const getFileName = extractors.getFileName;
    const wrapped = (value) => getFileName([{ value }]);

    it("handles empty file names", () => {
      expect(getFileName()).to.eql("UNKNOWN");
      expect(getFileName(null)).to.eql("UNKNOWN");
      expect(getFileName([])).to.eql("UNKNOWN");
      expect(wrapped(null)).to.eql("UNKNOWN");
      expect(wrapped("")).to.eql("UNKNOWN");
      expect(wrapped("   ")).to.eql("UNKNOWN");
    });

    it("handles basic file names", () => {
      expect(wrapped("!*** ./foo.js ***!")).to.eql("./foo.js");
      expect(wrapped("!*** ./~/foo.js ***!")).to.eql("./~/foo.js");
    });
  });

  describe("#getCode", () => {
    it("handles empty code");
    it("removes inline source mapping comments");
    it("preserves code after source mapping comments");
  });
});
