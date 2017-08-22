"use strict";

const expect = require("chai").expect;
const Compressor = require("../../../lib/utils/compressor");

const EMPTY_SIZES = {
  full: 0,
  min: '--',
  minGz: '--'
};
const EMPTY_SIZES_GZ = {
  full: 0,
  min: 0,
  minGz: 20 // (Cost of empty gzipping)
};

describe.only("lib/utils/compressor", () => {
  describe("#getFileName", () => {
    const create = (opts) => new Compressor(opts);

    it("handles empty bundles", () => {
      const comp = create();

      return Promise.all([
        comp.getSizes({ source: "" }).then(sizes => {
          expect(sizes).to.eql(EMPTY_SIZES);
        }),

        comp.getSizes({ source: "", minified: true, gzip: true }).then(sizes => {
          expect(sizes).to.eql(EMPTY_SIZES_GZ);
        }),

        comp.getSizes({ source: "    " }).then(sizes => {
          expect(sizes).to.eql(Object.assign({}, EMPTY_SIZES, {
            full: 4
          }));
        }),

        comp.getSizes({ source: "    ", minified: true, gzip: true }).then(sizes => {
          expect(sizes).to.eql(Object.assign({}, EMPTY_SIZES_GZ, {
            full: 4
          }));
        })
      ])
    });

    it("handles basic bundles");

    it("handles source map comments");
  });
});
