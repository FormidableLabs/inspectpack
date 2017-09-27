"use strict";

/**
 * **Note - Min, GZ**: We're using the current output values for minification
 * and gzipping, but these are pretty brittle constructs because the libraries
 * could change under the hood...
 */

const expect = require("chai").expect;
const Compressor = require("../../../lib/utils/compressor");

const EMPTY_SIZES = {
  full: 0,
  min: "--",
  minGz: "--"
};
const EMPTY_SIZES_GZ = {
  full: 0,
  min: 0,
  minGz: 20 // (Cost of empty gzipping)
};

describe("lib/utils/compressor", () => {
  describe("#getFileName", () => {
    const create = (opts) => new Compressor(opts);

    it("handles empty bundles", () => {
      const comp = create();

      return Promise.all([
        comp.getSizes({ source: "" }).then((sizes) => {
          expect(sizes).to.eql(EMPTY_SIZES);
        }),

        comp.getSizes({ source: "", minified: true, gzip: true }).then((sizes) => {
          expect(sizes).to.eql(EMPTY_SIZES_GZ);
        }),

        comp.getSizes({ source: "    " }).then((sizes) => {
          expect(sizes).to.eql(Object.assign({}, EMPTY_SIZES, {
            full: 4
          }));
        }),

        comp.getSizes({ source: "    ", minified: true, gzip: true }).then((sizes) => {
          expect(sizes).to.eql(Object.assign({}, EMPTY_SIZES_GZ, {
            full: 4
          }));
        })
      ]);
    });

    it("handles basic bundles", () => {
      const comp = create();

      return Promise.all([
        comp.getSizes({
          source: "const foo = () => 'foo';"
        }).then((sizes) => {
          expect(sizes).to.eql(Object.assign({}, EMPTY_SIZES, {
            full: 24
          }));
        }),

        comp.getSizes({
          source: "const foo = () => 'foo';",
          minified: true, gzip: true
        }).then((sizes) => {
          expect(sizes).to.eql({
            full: 24,
            min: 20,
            minGz: 38
          });
        })
      ]);
    });

    it("rejects with error on syntax error", () => {
      return create().getSizes({
        source: "**SYNTAX_ERROR**",
        minified: true, gzip: true
      }).then((sizes) => {
        throw new Error(`Expected failure. Instead got: ${JSON.stringify(sizes)}`);
      }).catch((err) => {
        expect(err).to.have.property("message", "Unexpected token: operator (**)");
      });
    });

    // Regression Test: https://github.com/FormidableLabs/webpack-dashboard/issues/182
    // (Didn't originally fail, but larger path to process).
    it("handles source map comments", () => {
      return create().getSizes({
        source: `
a=(function(module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "a",
function() { return UPDATE_LOCATION; });
var UPDATE_LOCATION = "@angular-redux/router::UPDATE_LOCATION";
//# sourceMappingURL=actions.js.map

/***/ })
`,
        minified: true, gzip: true
      }).then((sizes) => {
        expect(sizes).to.eql({
          full: 310,
          min: 111,
          minGz: 124
        });
      });
    });
  });
});
