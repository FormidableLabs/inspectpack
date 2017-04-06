"use strict";

const util = require("util");
const _ = require("lodash/fp");
const parse = require("babylon").parse;
const traverse = require("babel-traverse").default;
const t = require("babel-types");

const Base = require("./base");
const metaSum = require("../utils/data").metaSum;
const toParseable = require("../utils/code").toParseable;

// Parse helpers
const isExports = function (node) {
  return t.isIdentifier(node) && node.name === "exports";
};

const isModuleExports = function (node) {
  return t.isMemberExpression(node) &&
    t.isIdentifier(node.object) &&
    t.isIdentifier(node.property) &&
    node.object.name === "module" &&
    node.property.name === "exports";
};

const isExportsSubproperty = function (node) {
  if (!node.object) { return false; }

  return isExports(node.object) ||
    isModuleExports(node.object) ||
    // module.exports.foo.something
    isExportsSubproperty(node.object);
};

const isWebpackRequire = function (node) {
  return t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    node.callee.name === "__webpack_require__";
};

const isInteropCall = function (node) {
  return t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    node.callee.name === "_interopRequireDefault";
};

const isAssignmentExpressionStmt = function (node) {
  return t.isExpressionStatement(node) && t.isAssignmentExpression(node.expression);
};

const isEs6ModuleFlag = function (node) {
  if (!isAssignmentExpressionStmt(node)) {
    return false;
  }

  const left = node.expression.left;
  const right = node.expression.right;

  return node.expression.operator === "=" &&
    t.isMemberExpression(left) &&
    t.isIdentifier(left.object) &&
    left.object.name === "exports" &&
    t.isIdentifier(left.property) &&
    left.property.name === "__esModule" &&
    t.isBooleanLiteral(right) &&
    right.value === true;
};

const getReExportedReferences = function (moduleAst) {
  const otherModuleReferences = {};

  traverse(moduleAst, {
    noScope: true,
    AssignmentExpression(path) {
      const node = path.node;

      if (
        // module.exports.foo.something = __webpack_require__(4);
        // module.exports.foo = __webpack_require__(4);
        isExportsSubproperty(node.left) &&
        isWebpackRequire(node.right)
      ) {
        // eslint-disable-next-line no-magic-numbers
        otherModuleReferences[node.right.arguments[0].value] = node.loc;
      } else if (
        // module.exports = { foo: __webpack_require__(4) };
        t.isObjectExpression(node.right) &&
        isModuleExports(node.left)
      ) {
        _.each((objectProperty) => {
          if (isWebpackRequire(objectProperty.value)) {
            // eslint-disable-next-line no-magic-numbers
            otherModuleReferences[objectProperty.value.arguments[0].value] = node.right.loc;
          }
        })(node.right.properties);
      }
    }
  });

  return otherModuleReferences;
};

const getReExportedEs6References = function (moduleAst) {
  const moduleBody = _.get("program.body[0].expression.right.body.body")(moduleAst);
  const identifierToWebpackModule = {};
  const otherModuleReferences = {};

  let isEs6Module = false;
  let webpackModule;

  moduleBody.forEach((node) => {
    if (isEs6Module) {
      if (
        t.isVariableDeclaration(node) &&
        node.declarations.length === 1 // eslint-disable-line no-magic-numbers
      ) {
        const decl = node.declarations[0]; // eslint-disable-line no-magic-numbers

        if (isWebpackRequire(decl.init)) {
          // var _thing = __webpack_require__(244);
          // eslint-disable-next-line no-magic-numbers
          identifierToWebpackModule[decl.id.name] = decl.init.arguments[0].value;
        } else if (isInteropCall(decl.init)) {
          // var _thing2 = _interopRequireDefault(_thing)
          // eslint-disable-next-line no-magic-numbers
          const unShimedIndentifierName = decl.init.arguments[0] && decl.init.arguments[0].name;
          webpackModule = identifierToWebpackModule[unShimedIndentifierName];
          if (_.isNumber(webpackModule)) {
            identifierToWebpackModule[decl.id.name] = webpackModule;
          }
        }
      } else if (
        // exports.thing = _thing2["default"];
        isAssignmentExpressionStmt(node) &&
        isExportsSubproperty(node.expression.left) &&
        t.isMemberExpression(node.expression.right) &&
        t.isIdentifier(node.expression.right.object) &&
        node.expression.right.object.name in identifierToWebpackModule
      ) {
        webpackModule = identifierToWebpackModule[node.expression.right.object.name];
        otherModuleReferences[webpackModule] = node.loc;
      }
    } else if (isEs6ModuleFlag(node)) {
      // exports.__esModule = true;
      isEs6Module = true;
    }
  });

  return otherModuleReferences;
};

const getReExportedReferencesReport = function (src, reExportedReferences) {
  const snipped = "// ...";

  // Check if we have one or less re-export (in which case we don't care.)
  if (_.keys(reExportedReferences).length < 2) { // eslint-disable-line no-magic-numbers
    return false;
  }

  // Create a truncated version of output text with _just_ the re-export
  // matches
  const srcLines = src.split("\n");

  const snippets = _.flow(
    _.values,
    _.uniqBy(_.identity),
    _.map((loc) => { // eslint-disable-next-line no-magic-numbers
      return srcLines.slice(loc.start.line - 1, loc.end.line).join("\n");
    })
  )(reExportedReferences);

  return snippets.join(`\n${ snipped }\n`);
};

/**
 * Suspect parse functions.
 *
 * For `--suspect-parses`.
 */
const SUSPECT_PARSES = {
  // Multiple Exports.
  //
  // ```js
  // // Single declaration
  // module.exports = {
  //   foo: __webpack_require__(1),
  //   bar: __webpack_require__(2)
  // }
  //
  // // Multiple declaration
  // module.exports.foo = __webpack_require__(1);
  // module.exports.bar = __webpack_require__(2);
  // ```
  MULTIPLE_EXPORTS(src) {
    const ast = parse(src, { sourceType: "module" });
    const reExportedReferences = getReExportedReferences(ast);
    return getReExportedReferencesReport(src, reExportedReferences);
  },
  MULTIPLE_EXPORTS_ES(src) {
    const ast = parse(src, { sourcetype: "module" });
    const reExportedReferences = getReExportedEs6References(ast);
    return getReExportedReferencesReport(src, reExportedReferences);
  }
};

/**
 * Parse action abstraction.
 *
 * @returns {void}
 */
const Parse = function Parse() {
  Base.apply(this, arguments);
};

util.inherits(Parse, Base);

Parse.prototype.name = "parse";

Parse.prototype.textTemplate = _.template([
  "inspectpack --action=parse",
  "==========================",
  "",
  "## Summary",
  "",
  "* Bundle:",
  "    * Path:                <%= opts.bundle %>",
  "    * Num Matches:         <%= meta.numMatches %>",
  "    * Num Unique Files:    <%= meta.numUniqueFiles %>",
  "    * Num All Files:       <%= meta.numAllFiles %>",
  "    * Custom Parses:       <% _.each(function (key) { %>",
  "        * <%= key %>" +
  "<% })(opts.parse); %><% if (opts.suspectParses) { %>",
  "    * Suspect Parses:      <% _.each(function (key) { %>",
  "        * <%= key %>" +
  "<% })(meta.suspectParses); %><% } %>",
  "",
  "## Files                  <% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "* <%= fileName %>" +
  "<% })(data); %>",
  "",
  "## Matches",
  "<% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "* <%= fileName %>",
  "    * Num Matches:         <%= meta.parse.numMatches %>",
  "    * Num Files Matched:   <%= meta.parse.numFilesMatched %>",
  "",
  "<% _.each.convert({ cap: false })(function (obj, idx) { %>" +
  "    * <%= idx %>: <%= obj.source %><% if (obj.refs.length) { %>",
  "        * Files",
  "<% _.each(function (ref) { %>" +
  "            * <%= ref %>",
  "<% })(obj.refs); %><% } %>",
  "        * Matches: <%= obj.matches.length %>",
  "<% _.each(function (m) { %>" +
  "            * <%= m.key %>:",
  "<%= _.map(function (l) { return '              ' + l; })(m.match.split('\\n')).join('\\n') %>",
  "<% })(obj.matches); %>",
  "<% })((meta || meta.meta).summary); %>" + // Handle verbose.
  "<% })(data); %>",
  ""
].join("\n"));

Parse.prototype.tsvTemplate = _.template([
  "File\tIndexes\n",
  "<% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "<%= fileName %>\t",
  "<%= _.keys((meta || meta.meta).summary).join(\", \") %>\n",
  "<% })(data); %>",
  ""
].join(""));

Parse.prototype.getData = function (callback) {
  const opts = this.opts;
  const bundle = this.bundle;
  const codes = bundle.codes;
  const parseFns = this.opts.parseFns || {};

  // Inflate to objects of `{ [key], fn }`
  const parses = [].concat(
    // Suspect parses
    _.map.convert({ cap: false })((fn, key) => {
      return {
        key,
        fn
      };
    }, opts.suspectParses
      ? _.assign(SUSPECT_PARSES)(parseFns)
      : parseFns
    ),

    // Parse files from user
    _.map((fnPath) => {
      return {
        key: fnPath,
        fn: require(fnPath) // eslint-disable-line global-require
      };
    })(opts.path)
  );

  // Create data object.
  const data = _.flow(
    // Mutate summary with parse matches.
    _.mapValues((group) => {
      const meta = group.meta;

      // Stateful counters.
      let numMatches = 0;

      // Add matches, filter, and mutate summary.
      // eslint-disable-next-line lodash-fp/no-unused-result
      _.flow(
        // Map to match objects: `{ [key], fn, index, match }`
        _.flatMap((obj) => {
          // Try to match for all unique indexes in play.
          return _.flatMap((idx) => {
            return _.extend({
              index: idx,
              match: obj.fn(toParseable(_.find({ id: idx })(codes).code))
            }, obj);
          })(group.meta.uniqIdxs);
        }),

        // Only keep matches.
        _.filter((obj) => { return obj.match; }),

        // Get number of matches.
        _.tap((objs) => { numMatches = objs.length; }),

        // Map to final form and mutate summary: `{ [key], parse, match }`
        _.each((obj) => {
          meta.summary[obj.index].matches = [].concat(
            meta.summary[obj.index].matches || [],
            [{
              key: obj.key,
              match: obj.match
            }]
          );
        })
      )(parses);

      // Mutate summary to remove _unmatched_ indexes.
      meta.summary = _.pickBy((val) => { return !!val.matches; })(meta.summary);

      // Add parses data.
      meta.parse = {
        numMatches,
        numFilesMatched: _.keys(meta.summary).length
      };

      return group;
    }),

    // Filter to 1+ matches.
    _.pickBy((g) => { return !!g.meta.parse.numMatches; }),

    // Filter to just `meta` unless verbose.
    _.mapValues((g) => { return opts.verbose ? g : g.meta; })
  )(bundle.groups);

  // Metadata
  data.meta = {
    numMatches: metaSum("parse.numMatches")(data),
    numUniqueFiles: _.keys(data).length,
    numAllFiles: metaSum("parse.numFilesMatched")(data),
    suspectParses: _.keys(SUSPECT_PARSES)
  };

  callback(null, data);
};

/**
 * Return list of files matching 1+ parses.
 *
 * @param {Object}    opts                  Options
 * @param {String}    opts.bundle           Bundle file path
 * @param {String}    opts.code             Raw bundle string
 * @param {Array}     opts.parse            1+ file paths to parse functions
 * @param {Object}    opts.parseFns         A map with custom suspect name keys and parser values
 * @param {Boolean}   opts.suspectParses    Use suspect parses enum
 * @param {String}    opts.format           Output format type
 * @param {Boolean}   opts.verbose          Verbose output?
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Parse);
