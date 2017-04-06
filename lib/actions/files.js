"use strict";

const util = require("util");
const _ = require("lodash/fp");

const Base = require("./base");
const metaSum = require("../utils/data").metaSum;

const FULL_MATCH_GROUP = 0; // Full matched group is at index 0.
const PAIR_KEY = 0; // for `.toPairs|.fromPairs`
const PAIR_VAL = 1; // for `.toPairs|.fromPairs`

/**
 * Suspect patterns.
 *
 * For `--suspect-files`.
 */
const SUSPECT_FILES = {
  // Lodash libs with known multiple exports / overinclusive bundles
  //
  // **Note**: Based off `lodash@4.6.1`
  LODASH: "lodash\/(index|lodash|lodash\\\.min|array|collection|date|function|lang|math|number|object|seq|string|util)\\\.js", // eslint-disable-line max-len

  // Moment locales should really be honed down.
  //
  // A wip overview of the issues is available at:
  // https://github.com/moment/moment/issues/1435 For our canned regexes we
  // could just grep on any locales and enumerate the list, but we typically
  // want _some_ locales, just not all. Accordingly, we instead detect if the
  // "all locales" pattern was used in webpack and flag _that_ instead.
  //
  // A sensible solution to this should be something like:
  //
  // ```js
  // plugins: [
  //   new webpack.ContextReplacementPlugin(/moment[\\\/]locale$/, /^\.\/(en|es|OTHER_LOCALES)$/)
  // ]
  // ```
  //
  // **Note**: This regexp is super-tortured, because we're matching a string
  // that is _also_ a regexp: `moment/locale ^\.\/.*$`.
  MOMENT_LOCALE_ROOT: "moment\\\/locale \\\^\\\\\\\.\\\\\\\/\\\.\\\*\\\$"
};

/**
 * Files action abstraction.
 *
 * @returns {void}
 */
const Files = function Files() {
  Base.apply(this, arguments);
};

util.inherits(Files, Base);

Files.prototype.name = "files";

Files.prototype.textTemplate = _.template([
  "inspectpack --action=files",
  "==========================",
  "",
  "## Summary",
  "",
  "* Bundle:",
  "    * Path:                <%= opts.bundle %>",
  "    * Num Matches:         <%= meta.numMatches %>",
  "    * Num Files:           <%= meta.matchedFiles.length %>",
  "    * Custom Patterns:     <% _.each(function (pattern) { %>",
  "        * <%= pattern %>" +
  "<% })(opts.pattern); %><% if (opts.suspectFiles) { %>",
  "    * Suspect Patterns:    <% _.each.convert({ cap: false })(function (pattern, key) { %>",
  "        * <%= key %>: <%= pattern %>" +
  "<% })(meta.suspectFiles); %><% } %>",
  "",
  "## Files                  <% _.each(function (baseName) { %>",
  "* <%= baseName %>" +
  "<% })(meta.matchedFiles); %>",
  "",
  "## Matches",
  "<% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "* <%= fileName %>",
  "    * Matches:            <%= (meta || meta.meta).files.numMatches %>",
  "<% _.each(function (m) { %>" +
  "        * <%= m.key || 'CUSTOM' %> - <%= m.pattern %>: <%= m.match %>",
  "<% })((meta || meta.meta).files.matches); %>" + // Handle verbose.
  "    * Refs:",
  "<% _.each.convert({ cap: false })(function (obj, idx) { %>" +
  "        * <%= idx %>: <%= obj.source %><% if (obj.refs.length) { %>",
  "            * Files",
  "<% _.each(function (ref) { %>" +
  "                * <%= ref %>",
  "<% })(obj.refs); %><% } %>",
  "<% })((meta || meta.meta).summary); %>" + // Handle verbose.
  "<% })(data); %>",
  ""
].join("\n"));

Files.prototype.tsvTemplate = _.template([
  "File\tIndexes\n",
  "<% _.each.convert({ cap: false })(function (meta, fileName) { %>",
  "<%= fileName %>\t",
  "<%= _.keys((meta || meta.meta).summary).join(\", \") %>\n",
  "<% })(data); %>",
  ""
].join(""));

Files.prototype.getData = function (callback) {
  const opts = this.opts;
  const bundle = this.bundle;

  // Inflate to regex objects of `{ [key], re }`
  const patterns = [].concat(
    // Suspect patterns
    _.map.convert({ cap: false })((pat, key) => {
      return {
        key,
        re: new RegExp(pat)
      };
    })(opts.suspectFiles ? SUSPECT_FILES : {}),

    // Patterns from user
    _.map((pat) => {
      return {
        re: new RegExp(pat)
      };
    })(opts.pattern)
  );

  // Create data object.
  const data = _.flow(
    // Pairs since lodash/fp doesn't pass key to map|mapValues :(
    _.toPairs,

    // Mutate summary with pattern matches.
    _.map((pair) => {
      const baseName = pair[PAIR_KEY];
      const meta = pair[PAIR_VAL].meta;

      // Add matches, filter, and mutate summary.
      const matches = _.flow(
        // Map to match objects: `{ [key], re, match }`
        _.map((obj) => { // eslint-disable-line lodash-fp/no-extraneous-function-wrapping
          return _.extend({
            match: baseName.match(obj.re)
          }, obj);
        }),

        // Only keep matches.
        _.filter((obj) => { return obj.match; }),

        // Map to final form and mutate summary: `{ [key], pattern, match }`
        _.map((obj) => {
          return {
            key: obj.key,
            pattern: obj.re.toString(),
            match: obj.match[FULL_MATCH_GROUP] // entire matched segment.
          };
        })
      )(patterns);

      // Add files data.
      meta.files = {
        numMatches: matches.length,
        matches
      };

      return pair;
    }),

    // Back to object.
    _.fromPairs,

    // Filter to 1+ matches.
    _.pickBy((g) => { return !!g.meta.files.numMatches; }),

    // Filter to just `meta` unless verbose.
    _.mapValues((g) => { return opts.verbose ? g : g.meta; })
  )(bundle.groups);

  // Metadata
  data.meta = {
    numMatches: metaSum("files.numMatches")(data),
    suspectFiles: SUSPECT_FILES,
    matchedFiles: _.keys(data)
  };

  callback(null, data);
};

/**
 * Return list of files matching 1+ patterns.
 *
 * @param {Object}    opts              Options
 * @param {String}    opts.bundle       Bundle file path
 * @param {String}    opts.code         Raw bundle string
 * @param {Array}     opts.pattern      1+ patterns
 * @param {Boolean}   opts.suspectFiles Use suspect files enum
 * @param {String}    opts.format       Output format type
 * @param {Boolean}   opts.verbose      Verbose output?
 * @param {Function}  callback          Form `(err, data)`
 * @returns {void}
 */
module.exports = Base.createWithBundle.bind(Files);
