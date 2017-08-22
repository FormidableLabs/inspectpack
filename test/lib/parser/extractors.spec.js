"use strict";

const expect = require("chai").expect;
const extractors = require("../../../lib/parser/extractors");
const moduleTypes = require("../../../lib/models/module-types");

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
    const getCode = extractors.getCode;
    const wrapped = (value) => getCode({
      start: 0, end: value.length
    }, moduleTypes.CODE, value);

    it("handles empty code", () => {
      expect(wrapped("")).to.equal("");
      expect(wrapped("    ")).to.equal("    ");
    });

    it("handles basic code", () => {
      const val = `
var foo = 'foo';
var bar = 'bar';
`;
      expect(wrapped(val)).to.equal(val);
    });

    it("removes inline source mapping comments", () => {
      expect(wrapped(`
var foo = 'foo';
//# sourceMappingURL=foo.js.map
      `).trim()).to.equal("var foo = 'foo';");
    });

    // Regression Test: https://github.com/FormidableLabs/webpack-dashboard/issues/182
    it("preserves code after source mapping comments", () => {
      expect(wrapped(`
var foo = 'foo';
//# sourceMappingURL=foo.js.map

var bar = 'bar';
      `).trim()).to.equal("var foo = 'foo';\nvar bar = 'bar';");

      expect(wrapped(`
var foo = 'foo';
//# sourceMappingURL=foo.js.map

var bar = 'bar';
//# sourceMappingURL=bar.js.map

var baz = 'baz';
      `).trim()).to.equal("var foo = 'foo';\nvar bar = 'bar';\nvar baz = 'baz';");
    });

    it("extracts webpack eval source map"); // TODO: Find example.
  });
});
