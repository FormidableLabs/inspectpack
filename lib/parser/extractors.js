"use strict";

const _ = require("lodash/fp");
const t = require("babel-types");

const m = require("./matchers");
const moduleTypes = require("../models/module-types");

// Extracts the path from this string format:
// !*** ../foo/awesomez.js ***!
const extractPath = function (pathInfoComment) {
  if (!(pathInfoComment || "").trim()) { return "UNKNOWN"; }

  const beginningToken = "!*** ";
  const endToken = " ***!";

  const beginningIndex = pathInfoComment.indexOf(beginningToken);
  const endIndex = pathInfoComment.indexOf(endToken);
  return pathInfoComment.substring(
    beginningIndex + beginningToken.length,
    endIndex
  );
};

// Get the file path for the given module.
//
// ```js
//
// /*!**************************!*\
//   !*** ../foo/awesomez.js ***!   <-- Path
//   \**************************/
// /***/ function(module, exports, __webpack_require__) {
// ```
const getFileName = _.flow(
  _.find(m.isPathinfoComment),
  _.get("value"),
  extractPath
);

// Determine whether this module is code,
// a single reference, or a multi reference.
//
// This function makes the following assumptions of Webpack bundle output:
//   - Module IDs are of homogenous types.
//   - Module IDs are either numeric or string literals.
//
// These assumptions are unsound, as Webpack plugins can alter IDs however
// they like, but they should work in practice. The only frequently-used
// plugin that mutates module ID types is the NamedModulePlugin (used for
// better HMR debugging).
const getModuleType = function (node) {
  // A straight code reference.
  //
  // ```js
  //
  // /*!**************************!*\
  //   !*** ../foo/awesomez.js ***!
  //   \**************************/
  // /***/ function(module, exports, __webpack_require__) {   <-- Code
  // ```
  if (m.isWebpackFunctionExpression(node)) {
    return moduleTypes.CODE;
  }

  // ```
  //
  // A number or string. This is always a reference to _real code_.
  //
  // ```js
  //
  // /*!*******************************!*\
  //   !*** ../~/foo/bar/deduped.js ***!
  //   \*******************************/
  // 2612,                                                    <-- Number
  // ```
  if (t.isNumericLiteral(node) || t.isStringLiteral(node)) {
    return moduleTypes.SINGLE_REF;
  }

  // An array. The indexes can reference: code, template, a number,
  // a string, or another array.
  //
  // ```js
  //
  // /*!*******************************!*\
  //   !*** ../~/foo/baz/deduped.js ***!
  //   \*******************************/
  // [2612, 505, 506, 508, 509],                              <-- Array
  // ```
  if (
    t.isArrayExpression(node) &&
    node.elements.every((element) =>
      t.isNumericLiteral(element) ||
      t.isStringLiteral(element)
    )
  ) {
    return moduleTypes.MULTI_REF;
  }

  return moduleTypes.UNKNOWN;
};

// Remove any inline source maps or source map URLs.
// Matches:
// //# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uI..."
const removeSourceMap = function (rawCode) {
  return rawCode && rawCode
    .replace(/\/\/# sourceMappingURL=[^\r\n]*[\r\n]+/g, "") || "";
};

// Extract the "real" code from Webpack's eval() source map wrapper.
const getEvalContent = function (node, rawCode) {
  if (
    _.get("body.body.length")(node) === 1 &&
    _.get("body.body[0].expression.callee.name")(node) === "eval"
  ) {
    const rawFunctionExpression = rawCode
      .substring(node.start, node.body.start);

    const unwrappedCode = _.flow(
      _.get("body.body[0].expression.arguments[0].value"),
      removeSourceMap
    )(node);

    return `${rawFunctionExpression} { ${unwrappedCode} }`;
  }
  return null;
};

// Extract the raw code string of this module.
const getCode = function (node, moduleType, rawCode) {
  if (moduleType === moduleTypes.CODE) {
    return getEvalContent(node, rawCode) ||
      removeSourceMap(rawCode.substring(node.start, node.end));
  }

  return null;
};

// Extract the single numeric ref from this module.
const getSingleRef = function (node, moduleType) {
  if (moduleType === moduleTypes.SINGLE_REF) {
    return node.value;
  }

  return null;
};

// Extract an array of numeric refs from this module.
const getMultiRefs = function (node, moduleType) {
  if (moduleType === moduleType.MULTI_REF) {
    return node.elements.map((element) => {
      return element.value;
    });
  }

  return null;
};

module.exports = {
  getFileName,
  getModuleType,
  getEvalContent,
  getCode,
  getSingleRef,
  getMultiRefs
};
