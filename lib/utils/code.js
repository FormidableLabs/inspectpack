"use strict";

/**
 * Code helpers.
 */
module.exports = {
  /**
   * Helper function to convert webpack functions to parseable code.
   *
   * Webpack gives us chunks like:
   *
   * ```js
   * function(module, exports, __webpack_require__) {
   *   // function body
   * },
   * ```
   *
   * Which parsers like Uglify and Babylon don't like. We add a prefix,
   * truncate the trailing comma, and ensure the closing bracket is on
   * a new line to produce:
   *
   * ```js
   * a=function(module, exports, __webpack_require__) {
   *   // function body
   * }
   * ```
   *
   * @param {String} src Source code
   * @returns {String}   Parseable code
   */
  toParseable(src) {
    return `a=${src.trim().replace(/},?$/, "\n}")}`;
  }
};
