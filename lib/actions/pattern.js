"use strict";

const util = require("util");
const _ = require("lodash/fp");

const Base = require("./base");
const metaSum = require("../utils/data").metaSum;

const FULL_MATCH_GROUP = 0; // Full matched group is at index 0.

/**
 * Suspect patterns.
 *
 * For `--suspect-patterns`.
 */
const SUSPECT_PATTERNS = {
  // Multiple Exports.
  //
  // ```js
  // module.exports = {
  //   foo: __webpack_require__(1),
  //   bar: __webpack_require__(2)
  // }
  // ```
  MULTIPLE_EXPORTS_SINGLE:
    "[^\\n]*(module\\\.|)exports\\\s*=\\\s*\{(\\\s*.*__webpack_require__\\(.*){2}",

  // Multiple Exports.
  //
  // ```js
  // module.exports.foo = __webpack_require__(1);
  // module.exports.bar = __webpack_require__(2);
  // ```
  MULTIPLE_EXPORTS_MUTIPLE:
    "[^\\n]*((module\\\.|)exports\\\..*\\\s*=\\\s*.*__webpack_require__\\(.*\\\s*){2}"
};

/**
 * Pattern action abstraction.
 *
 * @returns {void}
 */
const Pattern = function Pattern() {
  Base.apply(this, arguments);
};

util.inherits(Pattern, Base);

Pattern.prototype.name = "pattern";

Pattern.prototype.textTemplate = _.template([
  "inspectpack --action=pattern",
  "============================",
  "",
  "## Summary",
  "",
  "* Bundle:",
  "    * Path:                <%= opts.bundle %>",
  "    * Num Matches:         <%= meta.numMatches %>",
  "    * Num Unique Files:    <%= meta.numUniqueFiles %>",
  "    * Num All Files:       <%= meta.numAllFiles %>",
  "    * Custom Patterns:     <% _.each(function (pattern) { %>",
  "        * <%= pattern %>" +
  "<% })(opts.pattern); %><% if (opts.suspectPatterns) { %>",
  "    * Suspect Patterns:    <% _.each.convert({ cap: false })(function (pattern, key) { %>",
  "        * <%= key %>: <%= pattern %>" +
  "<% })(meta.suspectPatterns); %><% } %>",
  "",
  "## Files                  <% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "* <%= fileName %>" +
  "<% })(data); %>",
  "",
  "## Matches",
  "<% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "* <%= fileName %>",
  "    * Num Matches:         <%= meta.pattern.numMatches %>",
  "    * Num Files Matched:   <%= meta.pattern.numFilesMatched %>",
  "",
  "<% _.each.convert({ cap: false })(function (obj, idx) { %>" +
  "    * <%= idx %>: <%= obj.source %><% if (obj.refs.length) { %>",
  "        * Files",
  "<% _.each(function (ref) { %>" +
  "            * <%= ref %>",
  "<% })(obj.refs); %><% } %>",
  "        * Matches: <%= obj.matches.length %>",
  "<% _.each(function (m) { %>" +
  "            * <%= m.key || 'CUSTOM' %> - <%= m.pattern %>:",
  "<%= _.map(function (l) { return '              ' + l; })(m.match.split('\\n')).join('\\n') %>",
  "<% })(obj.matches); %>",
  "<% })((meta || meta.meta).summary); %>" + // Handle verbose.
  "<% })(data); %>",
  ""
].join("\n"));

Pattern.prototype.tsvTemplate = _.template([
  "File\tIndexes\n",
  "<% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "<%= fileName %>\t",
  "<%= _.keys((meta || meta.meta).summary).join(\", \") %>\n",
  "<% })(data); %>",
  ""
].join(""));

Pattern.prototype.getData = function (callback) {
  const opts = this.opts;
  const bundle = this.bundle;
  const codes = bundle.codes;

  // Inflate to regex objects of `{ [key], re }`
  const patterns = [].concat(
    // Suspect patterns
    _.map.convert({ cap: false })((pat, key) => {
      return {
        key,
        re: new RegExp(pat)
      };
    })(opts.suspectPatterns ? SUSPECT_PATTERNS : {}),

    // Patterns from user
    _.map((pat) => {
      return {
        re: new RegExp(pat)
      };
    })(opts.pattern)
  );

  // Create data object.
  const data = _.flow(
    // Mutate summary with pattern matches.
    _.mapValues((group) => {
      const meta = group.meta;

      // Stateful counters.
      let numMatches = 0;

      // Add matches, filter, and mutate summary.
      // eslint-disable-next-line lodash-fp/no-unused-result
      _.flow(
        // Map to match objects: `{ [key], re, index, match }`
        _.flatMap((obj) => {
          // Try to match for all unique indexes in play.
          return _.flatMap((idx) => {
            return _.extend({
              index: idx,
              match: _.find({ id: idx })(codes)
                .code.match(obj.re)
            }, obj);
          })(group.meta.uniqIdxs);
        }),

        // Only keep matches.
        _.filter((obj) => { return obj.match; }),

        // Get number of matches.
        _.tap((objs) => { numMatches = objs.length; }),

        // Map to final form and mutate summary: `{ [key], pattern, match }`
        _.each((obj) => {
          meta.summary[obj.index].matches = [].concat(
            meta.summary[obj.index].matches || [],
            [{
              key: obj.key,
              pattern: obj.re.toString(),
              match: obj.match[FULL_MATCH_GROUP] // entire matched segment.
            }]
          );
        })
      )(patterns);

      // Mutate summary to remove _unmatched_ indexes.
      meta.summary = _.pickBy((val) => { return !!val.matches; })(meta.summary);

      // Add pattern data.
      meta.pattern = {
        numMatches,
        numFilesMatched: _.keys(meta.summary).length
      };

      return group;
    }),

    // Filter to 1+ matches.
    _.pickBy((g) => { return !!g.meta.pattern.numMatches; }),

    // Filter to just `meta` unless verbose.
    _.mapValues((g) => { return opts.verbose ? g : g.meta; })
  )(bundle.groups);

  // Metadata
  data.meta = {
    numMatches: metaSum("pattern.numMatches")(data),
    numUniqueFiles: _.keys(data).length,
    numAllFiles: metaSum("pattern.numFilesMatched")(data),
    suspectPatterns: SUSPECT_PATTERNS
  };

  callback(null, data);
};

/**
 * Return list of files matching 1+ patterns.
 *
 * @param {Object}    opts                  Options
 * @param {String}    opts.bundle           Bundle file path
 * @param {String}    opts.code             Raw bundle string
 * @param {Array}     opts.pattern          1+ patterns
 * @param {Boolean}   opts.suspectPatterns  Use suspect files enum
 * @param {String}    opts.format           Output format type
 * @param {Boolean}   opts.verbose          Verbose output?
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Pattern);
