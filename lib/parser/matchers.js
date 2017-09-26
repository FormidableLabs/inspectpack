"use strict";

const _ = require("lodash/fp");
const t = require("babel-types");

// Matches:
// /*!**************************!*\
//   !*** ../foo/awesomez.js ***!
//   \**************************/
const isPathinfoComment = function (leadingComment) {
  const val = (leadingComment || {}).value || "";
  return val.indexOf("!*** ") !== -1;
};

// TODO: determine if this can be more specific
// https://github.com/FormidableLabs/inspectpack/issues/25
const isWebpackFunctionExpression = function (node) {
  return t.isFunctionExpression(node);
};

// Matches: /* unknown exports provided */
            /* all exports used */
// Only appears in Webpack 2 (tree shaking)
const isWebpackExportsComment = function (leadingComment) {
  const val = (leadingComment || {}).value || "";
  return val.indexOf("exports provided") !== -1 ||
    val.indexOf("exports used") !== -1;
};

// Matches: /* 39 */
const isModuleIdLeadingComment = function (leadingComment) {
  const val = (leadingComment || {}).value || "";
  return _.isFinite(parseInt(val.trim(), 10));
};

// Matches: /***/
const hasWebpackAsteriskLeadingComment = _.find((leadingComment) => {
  const val = (leadingComment || {}).value || "";
  return val === "*";
});

// Is this actually a webpack module?
const isWebpackSectionType = function (node) {
  return isWebpackFunctionExpression(node) ||
    t.isNumericLiteral(node) ||
    t.isStringLiteral(node) ||
    t.isArrayExpression(node) && (
      node.elements.every(t.isNumericLiteral) ||
      node.elements.every(t.isStringLiteral)
    );
};

// Does this array section match the standard webpack module comment template?
const isWebpackArraySection = function (element) {
  return isWebpackSectionType(element) &&
    hasWebpackAsteriskLeadingComment(element.leadingComments);
};

// Does this object section match the standard webpack module comment template?
const isWebpackObjectSection = function (property) {
  return isWebpackSectionType(property.value) &&
    hasWebpackAsteriskLeadingComment(property.value.leadingComments);
};

module.exports = {
  isPathinfoComment,
  isWebpackFunctionExpression,
  isWebpackExportsComment,
  isModuleIdLeadingComment,
  isWebpackSectionType,
  isWebpackArraySection,
  isWebpackObjectSection
};
