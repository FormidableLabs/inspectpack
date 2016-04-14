"use strict";

var fs = require("fs");
var _ = require("lodash/fp");

/**
 * Webpack code section abstraction
 *
 * @param {Object}    opts        Options
 * @param {String}    opts.index  Index in Webpack bundle
 * @param {String}    opts.code   Raw JavaScript code
 * @returns {void}
 */
var Code = function Code(opts) {
  this.index = opts.index;
  this.code = opts.code;
  this.fileName = this._getFileName(this.code);
  this.baseName = this._getBaseName(this.fileName);
  this.isTemplate = this._isTemplate(this.fileName);
  this.isCode = this._isCode(this.code);

  // Infer if have scalar (`123`) or vector (`[123, 456]`) references.
  var refOrRefs = this._parseNumOrArray(this.code);
  this.ref = typeof refOrRefs === "number" ? refOrRefs : null;
  this.refs = Array.isArray(refOrRefs) ? refOrRefs : null;
};

/**
 * Return file name of line.
 *
 * @param   {String} code Raw JavaScript code
 * @returns {String}      File name
 */
Code.prototype._getFileName = function (code) {
  // Example:
  //
  // ```
  // 0
  // 1 /*!**************************!*\
  // 2   !*** ../foo/awesomez.js ***!       <-- Filename on line 2.
  // 3   \**************************/
  // ```
  return (code.split("\n", 3)[2] || "") // eslint-disable-line no-magic-numbers
    .replace("!***", "")
    .replace("***!", "")
    .replace(/^\s*|\s*$/g, "");
};

/**
 * Resolve to just the library name.
 *
 * Example: A nested component:
 * ```
 * ../foo/~/bar/baz.js -> bar/baz.js
 * ```
 *
 * @param   {String} fileName Full file name
 * @returns {String}          Base file name
 */
Code.prototype._getBaseName = function (fileName) {
  return _.last(fileName.split("~")).replace(/^\//, "");
};

/**
 * Return if template code.
 *
 * @param   {String} fileName Full file name
 * @returns {Boolean}         Is a template?
 */
Code.prototype._isTemplate = function (fileName) {
  return fileName.indexOf("template of ") === 0; // eslint-disable-line no-magic-numbers
};

/**
 * Return if actual code snippet (`true`) or index reference (`false`).
 *
 * @param   {String} code Raw JavaScript code
 * @returns {Boolean}     Is a real code snippet?
 */
Code.prototype._isCode = function (code) {
  // Code:
  //
  // ```
  // 0
  // 1 /*!**************************!*\
  // 2   !*** ../foo/awesomez.js ***!
  // 3   \**************************/
  // 4 /***/ function(module, exports, __webpack_require__) {  <-- Code! L4
  // ```
  //
  // Not code:
  //
  // ```js
  //
  // /*!*******************************!*\
  //   !*** ../~/foo/bar/deduped.js ***!
  //   \*******************************/
  // 2612,                                                     <-- Not code! L4
  //
  // /*!*******************************!*\
  //   !*** ../~/foo/baz/deduped.js ***!
  //   \*******************************/
  // [2612, 505, 506, 508, 509],                               <-- Not code! L4
  // ```
  /*eslint-disable no-magic-numbers*/
  return (code.split("\n", 5)[4] || "").indexOf("/***/ function") === 0;
};

/**
 * Parse a code snippet and inflate code or array.
 *
 * @param   {String}            code  Raw JavaScript code
 * @returns {null|Number|Array}       Null, a number, or an array of numbers
 */
Code.prototype._parseNumOrArray = function (code) {
  // A nothing reference.
  //
  // ```
  // /* 2602 */,
  // /* 2603 */,
  // /* 2604 */,
  // /* 2605 */,
  // /* 2606 */,
  // /* 2607 */,
  // /* 2608 */,
  // /* 2609 */
  // ```
  //
  // A straight code reference.
  //
  // ```js
  //
  // /*!**************************!*\
  //   !*** ../foo/awesomez.js ***!
  //   \**************************/
  // /***/ function(module, exports, __webpack_require__) {   <-- Code (null) L4
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
  //
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
  var line = code.split("\n", 5)[4];

  // May be completely empty.
  if (!line) { return null; }

  // Number.
  if (/^[0-9]/.test(line)) {
    return parseInt(line.replace(/,$/, ""), 10);
  }

  // Array.
  if (/^\[/.test(line)) {
    return JSON.parse(line.replace(/,$/, ""));
  }

  // Code
  return null;
};

/**
 * Bundle abstraction.
 *
 * Members:
 * - `codes`: Array of code objects by Webpack index.
 * - `groups`: Object of code objects grouped by `baseName`.
 *
 * @param {Object}    opts      Options
 * @param {String}    opts.code Raw JavaScript code
 * @returns {void}
 */
var Bundle = module.exports = function Bundle(opts) {
  this.code = opts.code;
  this.codes = this._createCodes(opts.code);
  this.groups = _.flow(
    this._groupByType(),
    this._addGroupMetadata(),
    this._validateGroups()
  )(this.codes);
};

/**
 * Validate bundle assumptions about the bundle.
 *
 * As a programming / Webpack API, we assert against aspects of the bundle
 * structure to validate that our ultimate inferences are correct.
 *
 * @returns {void}
 */
Bundle.prototype.validate = function () {
  var codes = this.codes;

  if (codes.length === 0) {
    throw new Error("No code sections found");
  }

  codes.forEach(function (code) {
    // Single number refs -> real code.
    if (code.ref !== null) {
      var singleRef = codes[code.ref];
      if (!singleRef.isCode) {
        throw new Error(
          "Expected: " + JSON.stringify(code) + " to reference code section." +
          "\nFound non-code: " + JSON.stringify(singleRef));
      }
    }

    // Array of refs -> code, template, ref, array of refs.
    // _Not_ empty.
    if (code.refs !== null) {
      code.refs.forEach(function (tmplRef) {
        var multiRef = codes[tmplRef];
        if (!multiRef.code.trim()) {
          throw new Error(
            "Expected: " + JSON.stringify(code) + " to be non-empty." +
            "\nFound: " + JSON.stringify(multiRef));
        }
      });
    }
  });
};

// Sections
//
// A section can be a "normal" chunk of code like:
//
// ```js
// /* 2601 */
// /*!**************************!*\
//   !*** ../foo/awesomez.js ***!
//   \**************************/
// /***/ function(module, exports) {
//
//   // CODE
//
// /***/ },
// ```
//
// or an index number:
//
// ```js
// /* 2601 */
// /*!**************************!*\
//   !*** ../foo/awesomez.js ***!
//   \**************************/
// 509,
// ```
//
// or an array of indexes:
//
// ```js
// /* 2601 */
// /*!**************************!*\
//   !*** ../foo/awesomez.js ***!
//   \**************************/
// [509, 510],
// ```
//
// Or, at the end, it can look like deduped templates with either no body or
// code.
//
// ```js
// /* 2602 */,
// /* 2603 */,
// /* 2604 */,
// /*!************************************!*\
//   !*** template of 499 referencing  ***!
//   \************************************/
// /***/ function(module, exports, __webpack_require__, /* ARGS */) {
//   // CODE
//
// /***/ },
// ```
Bundle.prototype.SECTION_RE = /^\/\* ([0-9]+) \*\/[\,]?/gm;

// Footer of webpack bundle.
Bundle.prototype.FOOTER_TOKEN = "\n/******/ ])"; // Can have 1+ `)` instances.

/**
 * Create array of code objects from raw code string.
 *
 * @param   {String}  code  Raw JavaScript code
 * @returns {Array}         List of `Code` objects
 */
Bundle.prototype._createCodes = function (code) {
  var footerToken = this.FOOTER_TOKEN;

  return code
    .split(this.SECTION_RE)
    .reduce(function (memo, part, i) {
      // Ignore first chunk, which is the Webpack header / boilerplate.
      if (i === 0) { return memo; } // eslint-disable-line no-magic-numbers

      var memoLen = memo.length;

      // Split produces pairs of [i, code, i, code, i, code] from here.
      if (i % 2 === 1) { // eslint-disable-line no-magic-numbers
        // Validate the index so we know we captured everything correctly.
        if (parseInt(part, 10) !== memoLen) {
          throw new Error("Invalid index. Expected: " + memoLen + ", Actual: " + part);
        }
      } else {
        // We've already thrown away the bundle Webpack header. Now detect and
        // remove the footer and everything after it
        var footerIdx = part.indexOf(footerToken);
        if (footerIdx > -1) {
          part = part.substr(0, footerIdx);
        }

        // Have the code chunk. The existing memo length _is_ the desired index
        memo.push(new Code({
          index: memoLen,
          code: part
        }));
      }

      return memo;
    }, []);
};

/**
 * Convert codes into groups of baseName, file types.
 *
 * @return {Function} Converts array to object
 */
Bundle.prototype._groupByType = function () {
  return _.flow(
    // Group by the base library name.
    _.groupBy(function (code) { return code.baseName; }),

    // Group into code, template, ref, refs.
    _.mapValues(function (codes) {
      return {
        code: _.filter({ isCode: true, isTemplate: false })(codes),
        template: _.filter({ isTemplate: true })(codes),
        ref: _.flow(
          _.filter(function (code) { return code.ref !== null; }),
          _.map(function (code) { return _.omit("code")(code); })
        )(codes),
        refs: _.flow(
          _.filter(function (code) { return code.refs !== null; }),
          _.map(function (code) { return _.omit("code")(code); })
        )(codes)
      };
    })
  );
};

/**
 * Add metadata to groups.
 *
 * @return {Function}     Mutates object values
 */
Bundle.prototype._addGroupMetadata = function () {
  var codesToFileNames = _.mapValues(_.map(function (code) { return code.fileName; }));

  return _.mapValues(function (group) {
    // All of the indexes for ultimate references.
    var meta = {
      // Code indexes for this group.
      codeIdxs: _.flow(
        _.groupBy(function (code) { return code.index; }),
        codesToFileNames
      )(group.code),

      // Unique internal/external code references for the group.
      refIdxs: _.flow(
        _.groupBy(function (code) { return code.ref; }),
        codesToFileNames
      )(group.ref),

      // External template references for the group.
      //
      // The **first** element of a multi-refs array
      // refers to a template that contains the code involved.
      refsIdxs: _.flow(
        _.groupBy(function (code) { return _.first(code.refs); }),
        codesToFileNames
      )(group.refs)
    };

    // More than one unique of _any_ means missed duplicates.
    meta.uniqIdxs = _.flow(
      _.map(function (i) { return parseInt(i); }),
      _.uniq
    )([].concat(
      _.keys(meta.codeIdxs),
      _.keys(meta.refIdxs),
      _.keys(meta.refsIdxs)
    ));

    // Summary. Mostly for display.
    meta.summary = _.flow(
      _.map(function (idx) {
        var codePath = meta.codeIdxs[idx] ? _.first(meta.codeIdxs[idx]) : null;

        return [idx, {
          source: codePath || "TEMPLATE",
          refs: _.uniq([].concat(
            meta.refIdxs[idx] || [],
            meta.refsIdxs[idx] || []
          ))
        }];
      }),

      _.fromPairs
    )(meta.uniqIdxs);

    return _.extend({ meta: meta }, group);
  });
};

/**
 * Validate assumptions about groups and metadata.
 *
 * @return {Function}   Iterator for grouped object
 */
Bundle.prototype._validateGroups = function () {
  var codes = this.codes;

  /*eslint-disable max-statements*/ // Validation can be long and tortured.
  return _.mapValues(function (group) {
    // Templates: Should not have any code, ref, or refs.
    var tmplLen = group.template.length;
    if (group.template.length) {
      if (tmplLen !== 1) { // eslint-disable-line no-magic-numbers
        // Same base name should never have more than 1 template.
        throw new Error("Found 2+ templates: " + JSON.stringify(group));
      } else if (group.code.length || group.ref.length || group.refs.length) {
        throw new Error("Found template with code|ref|refs: " + JSON.stringify(group));
      }

      return group;
    }

    // Check single references. Should have at most _one_ other ref, which
    // is a different **code** class.
    //
    // For instance, in lodash, have seen:
    // -  `684:lodash/internal/baseProperty.js` -> code
    // -  `960:lodash/_baseProperty.js` -> number `684`
    // - `2203:lodash/_baseProperty.js` -> number `684`
    // - `2409:lodash/_baseProperty.js` -> number `684`
    var extraRef = _.difference(group.meta.refIdxs, group.meta.codeIdxs);
    if (extraRef.length === 1) { // eslint-disable-line no-magic-numbers
      // Look up and check the extra item.
      var refItem = codes[_.first(extraRef)];
      if (!refItem.isCode) {
        throw new Error("Found non-code reference: " + JSON.stringify(refItem) +
          "\nFor: " + JSON.stringify(group));
      }

    } else if (extraRef.length > 1) { // eslint-disable-line no-magic-numbers
      throw new Error("2+ extra ref indexes: " + JSON.stringify(extraRef) +
        "\nItem: " + JSON.stringify(group));
    }

    // Check multi-references.
    //
    // Here, we _can_ have 2+ templates, which are missed duplicates.
    var refsIdxs = _.flow(
      _.map(function (code) { return _.first(code.refs); }),
      _.uniq
    )(group.refs);

    if (refsIdxs.length) {
      // Each refs index should be a template.
      _.each(function (refsIdx) {
        var refsItem = codes[refsIdx];
        if (!refsItem.isTemplate) {
          throw new Error("Found non-template reference: " + JSON.stringify(refsItem) +
            "\nFor: " + JSON.stringify(group));
        }
      })(refsIdxs);
    }

    return group;
  });
};

/**
 * Create and validate bundle object from file.
 *
 * **Note**: Must build webpack bundle with:
 * - `output.pathinfo = true`
 * - No minification.
 *
 * @param {Object}    opts        Options
 * @param {String}    opts.bundle Path to bundle file
 * @param {Function}  callback    Form `(err, data)`
 * @returns {void}
 */
Bundle.create = function (opts, callback) {
  // Validate. (Would be programming error).
  if (!opts.bundle) {
    throw new Error("Bundle option required");
  }

  fs.readFile(opts.bundle, function (err, data) {
    if (err) {
      callback(err);
      return;
    }

    // Create and validate.
    var bundle = new Bundle({
      code: data.toString()
    });

    bundle.validate();

    callback(null, bundle);
  });
};
