"use strict";

const _ = require("lodash/fp");
const babylon = require("babylon");
const t = require("babel-types");

const findModuleExpression = require("./find-module-expression");
const m = require("./matchers");
const extractors = require("./extractors");
const Code = require("../models/code");
const moduleTypes = require("../models/module-types");

// ```js
// /*!*****************************!*\
//   !*** ./app3.js + 3 modules ***!      <- Match a header
//   \*****************************/
// ```
const MODULE_CONCAT_HEADER_RE = /(.+) \+ ([0-9]+) modules$/;

// ```js
// // CONCATENATED MODULE: ./util-1.js    <- Match a section
// var one = "one";
// // CONCATENATED MODULE: ./util-2.js    <- Match a section
// var two = "two";
// // CONCATENATED MODULE: ./app3.js      <- Match a section
// ```
const MODULE_CONCAT_SECTION_RE = /^\/\/ CONCATENATED MODULE\: (.+)$/gm;

const extractConcatParts = (baseFileName, numAddlModules, code) => {
  const concatParts = {
    [baseFileName]: ""
  }; // Mutable collection of code parts.

  // Statefully iterate sections.
  // First, reset.
  MODULE_CONCAT_SECTION_RE.lastIndex = 0;

  // Then, iterate.
  // Order is:
  // - Start of code: This is attributable to `fileName` module / last concat header.
  // - Concat sections
  //   - Concat section heading
  //   - Concat section code
  // - End of code: This is attributable to `fileName` module / last concat header.
  let match;
  let curIndex = 0;
  let curFileName = baseFileName;
  while ((match = MODULE_CONCAT_SECTION_RE.exec(code)) !== null) {
    // The index of the current match is the **end** of the previous code.
    concatParts[curFileName] = (concatParts[curFileName] || "") +
      code.substring(curIndex, match.index);

    // Increment for next iteration.
    curFileName = match[1];
    curIndex = match.index;
  }

  // Final iteration.
  concatParts[curFileName] += code.substring(curIndex, code.length);

  // Sanity check that we unpacked things correctly.
  if (curFileName !== baseFileName) {
    throw new Error(
      `Final concat part did not module name: ${JSON.stringify({ curFileName, baseFileName })}`);
  } else if (numAddlModules + 1 !== Object.keys(concatParts).length) {
    throw new Error(`Could not extract all concat parts: ${JSON.stringify({
      numAddlModules,
      extractedNames: Object.keys(concatParts)
    })}`);
  }

  return concatParts;
};

const extractFromPart = function (moduleId, element, rawCode) {
  const fileName = extractors.getFileName(element.leadingComments);
  const moduleType = extractors.getModuleType(element);
  const code = extractors.getCode(element, moduleType, rawCode);
  const singleRef = extractors.getSingleRef(element, moduleType);
  const multiRefs = extractors.getMultiRefs(element, moduleType);

  // Complexity: `ModuleConcatenationPlugin`
  // Module concantenation / "scope hoisting" munges multiple modules into
  // one larger one. We attempt to split up the single module into its
  // parts that are attributable to each part.
  const concatMatch = MODULE_CONCAT_HEADER_RE.exec(fileName);
  if (concatMatch) {
    const baseFileName = concatMatch[1];
    const numAddlModules = parseInt(concatMatch[2], 10); // eslint-disable-line no-magic-numbers
    const concatParts = extractConcatParts(baseFileName, numAddlModules, code);

    // Emit all sub-sections.
    // **Note**: subsections share the same module id's and other files.
    return Object.keys(concatParts).map((partFileName) => new Code({
      id: moduleId,
      fileName: partFileName,
      type: moduleType,
      code: concatParts[partFileName],
      singleRef,
      multiRefs
    }));
  }

  return [
    new Code({
      id: moduleId,
      fileName,
      type: moduleType,
      code,
      singleRef,
      multiRefs
    })
  ];
};

const extractFromArrayExpression = function (node, rawCode) {
  // This is a valid bundle, but its modules are empty
  const elements = node.elements.filter(Boolean);

  if (_.isEmpty(elements)) {
    return [new Code({ type: moduleTypes.EMPTY })];
  }

  // We remove falsy nodes from the elements because
  // jsonp bundles can have empty array elements:
  // webpackJsonp([1],[
  //  /* 0 */, <---- empty item
  //  /* 1 */
  // eslint-disable-next-line max-statements
  return elements.reduce((modules, element) => {
    const moduleIds = _.initial(element.leadingComments)
      .filter(m.isModuleIdLeadingComment);

    // If we have extra module IDs above the last module ID comment, we treat
    // the extras as "nothing" references (they add nothing to the bundle).
    if (moduleIds.length > 1) {
      _.initial(moduleIds).forEach((reference) => {
        modules.push(
          new Code({
            id: reference.value.trim(),
            type: moduleTypes.NOTHING_REF
          })
        );
      });
    }

    const moduleId = _.last(moduleIds).value.trim();
    return modules.concat(extractFromPart(moduleId, element, rawCode));
  }, []);
};

const extractFromObjectExpression = function (node, rawCode) {
  // This is a valid bundle, but its modules are empty
  if (_.isEmpty(node.properties)) {
    return [new Code({ type: moduleTypes.EMPTY })];
  }

  return node.properties.reduce((modules, property) => {
    const moduleId = property.key.value.toString();
    const element = property.value;
    return modules.concat(extractFromPart(moduleId, element, rawCode));
  }, []);
};

// Webpack outputs two types of bundles:
// - An array expression of function expressions ([function() {}, function() {}])
//   with module IDs as preceding comments
// - An object expression ({ 14: function() {} })
//   with module IDs as keys
const extractModules = function (node, rawCode, opts) {
  if (t.isArrayExpression(node)) {
    return extractFromArrayExpression(node, rawCode, opts);
  }

  if (t.isObjectExpression(node)) {
    return extractFromObjectExpression(node, rawCode, opts);
  }

  // Structure: `Array(NUM).concat([/*actual modules array*/])`
  if (t.isCallExpression(node) && node.arguments.length) {
    const potentialArrayNode = node.arguments[0];
    if (t.isArrayExpression(potentialArrayNode)) {
      return extractFromArrayExpression(potentialArrayNode, rawCode, opts);
    }
  }

  return [];
};

/**
 * Parse a Webpack bundle and extract code/metadata of each module.
 *
 * @param   {String}      rawCode   Source code
 * @returns {Array<Code>} The extracted modules
 */
module.exports = function (rawCode) {
  const ast = babylon.parse(rawCode);
  const moduleExpression = findModuleExpression(ast);

  // The file is malformed or not webpack output
  if (!moduleExpression) {
    return [];
  }

  return extractModules(moduleExpression, rawCode);
};
