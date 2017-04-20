"use strict";

const _ = require("lodash/fp");
const babylon = require("babylon");
const traverse = require("babel-traverse").default;
const t = require("babel-types");

const m = require("./matchers");
const extractors = require("./extractors");
const Code = require("../models/code");
const moduleTypes = require("../models/module-types");

const extractFromArrayExpression = function (node, modules, rawCode) {
  const webpackSections = node.elements.filter(m.isWebpackArraySection);

  if (!webpackSections.length) {
    return;
  }

  webpackSections.forEach(element => {
    const moduleIds = _.initial(element.leadingComments)
      .filter(m.isModuleIdLeadingComment);

    // If we have extra module IDs above the last module ID comment, we treat
    // the extras as "nothing" references (they add nothing to the bundle).
    if (moduleIds.length > 1) {
      _.initial(moduleIds).forEach(reference => {
        modules.push(
          new Code({
            id: reference.value.trim(),
            type: moduleTypes.NOTHING_REF
          })
        );
      });
    }
    // debugger;
    const moduleId = _.last(moduleIds).value.trim();
    const fileName = extractors.getFileName(element.leadingComments);
    const moduleType = extractors.getModuleType(element);

    modules.push(
      new Code({
        id: moduleId,
        fileName,
        type: moduleType,
        code: extractors.getCode(element, moduleType, rawCode),
        singleRef: extractors.getSingleRef(element, moduleType),
        multiRefs: extractors.getMultiRefs(element, moduleType)
      })
    );
  });
};

const extractFromObjectExpression = function (node, modules, rawCode) {
  if (
    !node.properties.length ||
    !node.properties.every(m.isWebpackObjectSection)
  ) {
    return;
  }

  node.properties.forEach(property => {
    const fileName = extractors.getFileName(property.value.leadingComments);
    const moduleType = extractors.getModuleType(property.value);

    modules.push(
      new Code({
        id: property.key.value.toString(),
        fileName,
        type: extractors.getModuleType(property.value),
        code: extractors.getCode(property.value, moduleType, rawCode),
        singleRef: extractors.getSingleRef(property.value, moduleType),
        multiRefs: extractors.getMultiRefs(property.value, moduleType)
      })
    );
  });
};

// Webpack outputs two types of bundles:
// - An array expression of function expressions ([function() {}, function() {}])
//   with module IDs as preceding comments
// - An object expression ({ 14: function() {} })
//   with module IDs as keys
const extractModules = function (modules, rawCode) {
  return node => {
    if (t.isArrayExpression(node)) {
      extractFromArrayExpression(node, modules, rawCode);
    }

    if (t.isObjectExpression(node)) {
      extractFromObjectExpression(node, modules, rawCode);
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
  traverse.cheap(ast, extractModules(modules, rawCode));
  return modules;
};
