"use strict";

const _ = require("lodash/fp");
const babylon = require("babylon");
const traverse = require("babel-traverse").default;
const t = require("babel-types");

const Code = require("../models/code");
const moduleTypes = require("../models/module-types");

// Extracts the path from this string format:
// !*** ../foo/awesomez.js ***!
const extractPath = function (pathInfoComment) {
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
  _.find((comment) => {
    return comment.value.indexOf("!*** ") !== -1;
  }),
  _.get("value"),
  extractPath
);

// TODO: determine if this can be more specific
// https://github.com/FormidableLabs/inspectpack/issues/25
const isWebpackFunctionExpression = function (node) {
  return t.isFunctionExpression(node);
};

// Determine whether this module is code,
// a single reference, or a multi reference
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
  if (isWebpackFunctionExpression(node)) {
    return moduleTypes.CODE;
  }

  // ```
  //
  // A number. This is always a reference to _real code_.
  //
  // ```js
  //
  // /*!*******************************!*\
  //   !*** ../~/foo/bar/deduped.js ***!
  //   \*******************************/
  // 2612,                                                    <-- Number
  // ```
  if (t.isNumericLiteral(node)) {
    return moduleTypes.SINGLE_REF;
  }

  // An array. The indexes can reference: code, template, a number, or
  // another array.
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
    node.elements.every(t.isNumericLiteral)
  ) {
    return moduleTypes.MULTI_REF;
  }

  return moduleTypes.UNKNOWN;
};

// Extract the raw code string of this module.
const getCode = function (node, moduleType, rawCode) {
  if (moduleType === moduleTypes.CODE) {
    return rawCode.substring(node.start, node.end);
  }

  return null;
};

// Extract the single numeric ref from this module.
const getSingleRef = function (node, moduleType) {
  if (moduleType === moduleTypes.SINGLE_REF) {
    return parseInt(node.value, 10);
  }

  return null;
};

// Extract an array of numeric refs from this module.
const getMultiRefs = function (node, moduleType) {
  if (moduleType === moduleType.MULTI_REF) {
    return node.elements.map((element) => {
      return parseInt(element.value, 10);
    });
  }

  return null;
};

// Matches: /* 39 */
const isModuleIdLeadingComment = function (leadingComment) {
  return /\s[0-9]+\s/g.test(leadingComment.value);
};

// Matches: /***/
const hasWebpackAsteriskLeadingComment = _.find((leadingComment) => {
  return leadingComment.value === "*";
});

const hasModuleIdLeadingComment = _.find(isModuleIdLeadingComment);

// Is this actually a webpack module?
const isWebpackSectionType = function (node) {
  return isWebpackFunctionExpression(node) ||
    t.isNumericLiteral(node) ||
    t.isArrayExpression(node) &&
    node.elements.every(t.isNumericLiteral);
};

// Does this array section match the standard webpack module comment template?
const isWebpackArraySection = function (element) {
  return isWebpackSectionType(element) &&
    hasWebpackAsteriskLeadingComment(element.leadingComments) &&
    hasModuleIdLeadingComment(element.leadingComments);
};

// Does this object section match the standard webpack module comment template?
const isWebpackObjectSection = function (property) {
  return isWebpackSectionType(property.value) &&
    hasWebpackAsteriskLeadingComment(property.value.leadingComments) &&
    t.isNumericLiteral(property.key);
};

// Webpack outputs two types of bundles:
// - An array expression of function expressions ([function() {}, function() {}])
//   with module IDs as preceding comments
// - An object expression ({ 14: function() {} })
//   with module IDs as keys
const extractModules = function (modules, rawCode) {
  return {
    ArrayExpression(path) {
      const webpackSections = path.node.elements
        .filter(isWebpackArraySection);

      if (!webpackSections.length) {
        return;
      }

      webpackSections.forEach((element) => {
        const moduleIds = element.leadingComments
          .filter(isModuleIdLeadingComment);

        // If we have extra module IDs above the last module ID comment, we treat
        // the extras as "nothing" references (they add nothing to the bundle).
        if (moduleIds.length > 1) {
          _.initial(moduleIds).forEach((reference) => {
            modules.push(new Code({
              id: parseInt(reference.value.trim(), 10),
              type: moduleTypes.NOTHING_REF
            }));
          });
        }

        const moduleId = parseInt(_.last(moduleIds).value.trim(), 10);
        const fileName = getFileName(element.leadingComments);
        const moduleType = getModuleType(element);

        modules.push(new Code({
          id: moduleId,
          fileName,
          type: moduleType,
          code: getCode(element, moduleType, rawCode),
          singleRef: getSingleRef(element, moduleType),
          multiRefs: getMultiRefs(element, moduleType)
        }));
      });
    },
    ObjectExpression(path) {
      if (
        !path.node.properties.length ||
        !path.node.properties.every(isWebpackObjectSection)
      ) {
        return;
      }

      path.node.properties.forEach((property) => {
        const fileName = getFileName(property.value.leadingComments);
        const moduleType = getModuleType(property.value);

        modules.push(new Code({
          id: parseInt(property.key.value, 10),
          fileName,
          type: getModuleType(property.value),
          code: getCode(property.value, moduleType, rawCode),
          singleRef: getSingleRef(property.value, moduleType),
          multiRefs: getMultiRefs(property.value, moduleType)
        }));
      });
    }
  };
};

/**
 * Parse a Webpack bundle and extract code/metadata of each module.
 *
 * @param   {String}      rawCode   Source code
 * @returns {Array<Code>} The extracted modules
 */
module.exports = function (rawCode) {
  const ast = babylon.parse(rawCode);
  const modules = [];
  traverse(ast, extractModules(modules, rawCode));
  return modules;
};
