"use strict";

var util = require("util");
var _ = require("lodash/fp");
var objMap = require("lodash/map"); // TODO GLOBAL: Unwind this with global config.
var babylon = require("babylon");

var Base = require("./base");
var metaSum = require("../utils/data").metaSum;
var toParseable = require("../utils/code").toParseable;

/**
 * Suspect parse functions.
 *
 * For `--suspect-parses`.
 */
var SUSPECT_PARSES = {
  // TODO: REMOVE - This is a regex version of a single type of multiple exports detection.
  MULTIPLE_EXPORT_RE_TEMP: function (src) {
    var re = new RegExp(
      "[^\\n]*(module\\\.|)exports\\\s*=\\\s*\{(\\\s*.*__webpack_require__\\(.*){2}");
    var match = src.match(re);

    return match ? match[0] : null; // eslint-disable-line no-magic-numbers
  },

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
  MULTIPLE_EXPORT: function (src) {
    var ast = babylon.parse(src, {
      sourceType: "module"
    });

    ///////////////////////////////////////////////////////////////////////////
    // Holla Babel Experts!
    // --------------------
    // Right here we'd like to handle at least the first three `a`, `b`, `c`
    // of https://gist.github.com/ryan-roemer/c2b507ef0e17c392b9f09b7a03e1371c
    // and _if possible_, the stretch goal of `d`.
    //
    // This function simply needs to return `true` if there is a multiple
    // export match.
    //
    // After this section is done, please remove `MULTIPLE_EXPORT_RE_TEMP`
    // above which gives a regex version of one of our scenarios as a guide
    // for how things should work.
    //
    // THANKS!
    ///////////////////////////////////////////////////////////////////////////
    console.log("TODO HERE AST", JSON.stringify(ast, null, 2)); // eslint-disable-line
    ///////////////////////////////////////////////////////////////////////////

    return false;
  }
};

/**
 * Parse action abstraction.
 *
 * @returns {void}
 */
var Parse = function Parse() {
  Base.apply(this, arguments);
};

util.inherits(Parse, Base);

Parse.prototype.name = "parse";

Parse.prototype.textTemplate = _.template([
  "inspectpack --action=parse",
  "============================",
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
  "## Matches",
  "<% _.each(function (meta, fileName) { %>",
  "* <%= fileName %>",
  "    * Num Matches:         <%= meta.parse.numMatches %>",
  "    * Num Files Matched:   <%= meta.parse.numFilesMatched %>",
  "",
  "<% _.each(function (obj, idx) { %>" +
  "    * <%= idx %>: <%= obj.source %><% if (obj.refs.length) { %>",
  "        * Files",
  "<% _.each(function (ref) { %>" +
  "            * <%= ref %>",
  "<% })(obj.refs); %><% } %>",
  "        * Matches: <%= obj.matches.length %>",
  "<% _.each(function (m) { %>" +
  "            * <%= m.key %> - TODO_REMOVED_PATTERN:",
  "<%= _.map(function (l) { return '              ' + l; })(m.match.split('\\n')).join('\\n') %>",
  "<% })(obj.matches); %>",
  "<% })((meta || meta.meta).summary); %>" + // Handle verbose.
  "<% })(data); %>",
  ""
].join("\n"));

Parse.prototype.getData = function (callback) {
  var opts = this.opts;
  var bundle = this.bundle;
  var codes = bundle.codes;

  // Inflate to regex objects of `{ [key], fn }`
  var parses = [].concat(
    // Suspect parses
    objMap(opts.suspectParses ? SUSPECT_PARSES : {}, function (fn, key) {
      return {
        key: key,
        fn: fn
      };
    }),

    // Parse files from user
    _.map(function (fnPath) {
      return {
        key: fnPath,
        fn: require(fnPath) // eslint-disable-line global-require
      };
    })(opts.paths)
  );

  // Create data object.
  var data = _.flow(
    // Mutate summary with parse matches.
    _.mapValues(function (group) {
      var meta = group.meta;

      // Stateful counters.
      var numMatches = 0;

      // Add matches, filter, and mutate summary.
      _.flow(
        // Map to match objects: `{ [key], fn, index, match }`
        _.flatMap(function (obj) {
          // Try to match for all unique indexes in play.
          return _.flatMap(function (idx) {
            return _.extend({
              index: idx,
              match: obj.fn(toParseable(codes[idx].code))
            }, obj);
          })(group.meta.uniqIdxs);
        }),

        // Only keep matches.
        _.filter(function (obj) { return obj.match; }),

        // Get number of matches.
        _.tap(function (objs) { numMatches = objs.length; }),

        // Map to final form and mutate summary: `{ [key], parse, match }`
        _.each(function (obj) {

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
      meta.summary = _.pickBy(function (val) { return !!val.matches; })(meta.summary);

      // Add parses data.
      meta.parse = {
        numMatches: numMatches,
        numFilesMatched: _.keys(meta.summary).length
      };

      return group;
    }),

    // Filter to 1+ matches.
    _.pickBy(function (g) { return !!g.meta.parse.numMatches; }),

    // Filter to just `meta` unless verbose.
    _.mapValues(function (g) { return opts.verbose ? g : g.meta; })
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
 * @param {Array}     opts.parse            1+ file paths to parse functions
 * @param {Boolean}   opts.suspectParses    Use suspect parses enum
 * @param {String}    opts.format           Output format type
 * @param {Boolean}   opts.verbose          Verbose output?
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Parse);
