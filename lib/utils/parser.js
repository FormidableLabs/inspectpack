"use strict";

var _ = require("lodash/fp");
var babylon = require("babylon");
var traverse = require("babel-traverse").default;
var t = require("babel-types");

var Code = require("../models/code");
var moduleTypes = require("../models/module-types");

var extractPath = function (pathInfoComment) {
  var beginningToken = "!*** ";
  var endToken = " ***!";

  var beginningIndex = pathInfoComment.indexOf(beginningToken);
  var endIndex = pathInfoComment.indexOf(endToken);
  return pathInfoComment.substring(
    beginningIndex + beginningToken.length,
    endIndex
  );
};

var getFileName = _.flow(
  _.find(function (comment) {
    return comment.value.indexOf("!*** ") !== -1;
  }),
  _.get("value"),
  extractPath
);

var isWebpackFunctionExpression = function (node) {
  // TODO: determine if this can be more specific
  return t.isFunctionExpression(node);
};

var getModuleType = function (node) {
  // A straight code reference.
  //
  // ```js
  //
  // /*!**************************!*\
  //   !*** ../foo/awesomez.js ***!
  //   \**************************/
  // /***/ function(module, exports, __webpack_require__) {   <-- Code (null) L4
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
  // 2612,                                                    <-- Number L4
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
  // [2612, 505, 506, 508, 509],                              <-- Array L4
  // ```
  if (
    t.isArrayExpression(node) &&
    node.elements.every(t.isNumericLiteral)
  ) {
    return moduleTypes.MULTI_REF;
  }

  return moduleTypes.UNKNOWN;
};

var getCode = function (node, moduleType, rawCode) {
  if (moduleType === moduleTypes.CODE) {
    return rawCode.substring(node.start, node.end);
  }

  return null;
};

var getSingleRef = function (node, moduleType) {
  if (moduleType === moduleTypes.SINGLE_REF) {
    return node.value;
  }

  return null;
};

var getMultiRefs = function (node, moduleType) {
  if (moduleType === moduleType.MULTI_REF) {
    return node.elements.map(function (element) {
      return element.value;
    });
  }

  return null;
};

var isModuleIdLeadingComment = function (leadingComment) {
  return /\s[0-9]+\s/g.test(leadingComment.value);
};

var hasWebpackAsteriskLeadingComment = _.find(function (leadingComment) {
  return leadingComment.value === "*";
});

var hasModuleIdLeadingComment = _.find(isModuleIdLeadingComment);

var isWebpackSectionType = function (node) {
  return isWebpackFunctionExpression(node) ||
    t.isNumericLiteral(node) ||
    t.isArrayExpression(node) &&
    node.elements.every(t.isNumericLiteral);
};

var isWebpackArraySection = function (element) {
  return isWebpackSectionType(element) &&
    hasWebpackAsteriskLeadingComment(element.leadingComments) &&
    hasModuleIdLeadingComment(element.leadingComments);
};

var isWebpackObjectSection = function (property) {
  return isWebpackSectionType(property.value) &&
    hasWebpackAsteriskLeadingComment(property.value.leadingComments) &&
    t.isNumericLiteral(property.key);
};

var extractModules = function (modules, rawCode) {
  return {
    ArrayExpression: function (path) {
      var webpackSections = path.node.elements
        .filter(isWebpackArraySection);

      if (!webpackSections.length) {
        return;
      }

      webpackSections.forEach(function (element) {
        var moduleIds = element.leadingComments
          .filter(isModuleIdLeadingComment);

        if (moduleIds.length > 1) {
          _.initial(moduleIds).forEach(function (reference) {
            modules.push(new Code({
              id: reference.value.trim(),
              type: moduleTypes.NOTHING_REF
            }));
          });
        }

        var moduleId = _.last(moduleIds).value.trim();
        var fileName = getFileName(element.leadingComments);
        var moduleType = getModuleType(element);

        modules.push(new Code({
          id: moduleId,
          fileName: fileName,
          type: moduleType,
          code: getCode(element, moduleType, rawCode),
          singleRef: getSingleRef(element, moduleType),
          multiRefs: getMultiRefs(element, moduleType)
        }));
      });
    },
    ObjectExpression: function (path) {
      if (
        !path.node.properties.length ||
        !path.node.properties.every(isWebpackObjectSection)
      ) {
        return;
      }

      path.node.properties.forEach(function (property) {
        var fileName = getFileName(property.value.leadingComments);
        var moduleType = getModuleType(property.value);

        modules.push(new Code({
          id: property.key.value,
          fileName: fileName,
          type: getModuleType(property.value),
          code: getCode(property.value, moduleType, rawCode),
          singleRef: getSingleRef(property.value, moduleType),
          multiRefs: getMultiRefs(property.value, moduleType)
        }));
      });
    }
  };
};

module.exports = function (rawCode) {
  var ast = babylon.parse(rawCode);
  var modules = [];
  traverse(ast, extractModules(modules, rawCode));
  return modules;
};
