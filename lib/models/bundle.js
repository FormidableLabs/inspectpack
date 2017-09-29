"use strict";

const fs = require("fs");
const _ = require("lodash/fp");
const parse = require("../parser");

/**
 * Bundle abstraction.
 *
 * Members:
 * - `codes`: Array of code objects by Webpack ID.
 * - `groups`: Object of code objects grouped by `baseName`.
 *
 * @param {Object}    opts            Options
 * @param {String}    opts.code       Raw JavaScript code
 * @param {Boolean}   opts.allowEmpty Allow empty/unparseable bundles
 * @returns {void}
 */
const Bundle = module.exports = function Bundle(opts) {
  this.path = opts.path;
  this.code = opts.code;
  this.allowEmpty = opts.allowEmpty;

  const allCodes = parse(opts.code);

  const firstCode = _.first(allCodes);
  this.isEmpty = firstCode && firstCode.isEmpty();

  this.codes = allCodes.filter((code) =>
    !code.isNothingRef() &&
    !code.isEmpty() &&
    !code.isUnknown()
  );

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
  const codes = this.codes;

  if (!this.allowEmpty && (!this.isEmpty && codes.length === 0)) {
    throw new Error("No code sections found");
  }

  codes.forEach((code) => {
    // Single number refs -> real code.
    if (code.isSingleRef()) {
      const singleRef = _.find({ id: code.singleRef })(codes);
      if (!singleRef.code) {
        throw new Error(
          `Expected: ${ JSON.stringify(code) } to reference code section.` +
          `\nFound non-code: ${ JSON.stringify(singleRef)}`);
      }
    }

    // Array of refs -> code, template, ref, array of refs.
    // _Not_ empty.
    if (code.isMultiRef()) {
      code.multiRefs.forEach((tmplRef) => {
        const multiRef = _.find({ id: tmplRef })(codes);
        if (!multiRef.code.trim()) {
          throw new Error(
            `Expected: ${ JSON.stringify(code) } to be non-empty.` +
            `\nFound: ${ JSON.stringify(multiRef)}`);
        }
      });
    }
  });
};

/**
 * Convert codes into groups of baseName, file types.
 *
 * @return {Function} Converts array to object
 */
Bundle.prototype._groupByType = function () {
  return _.flow(
    // Group by the base library name.
    _.groupBy((code) => { return code.baseName; }),

    // Group into code, template, ref, refs.
    _.mapValues((codes) => {
      return {
        code: _.filter((code) => {
          return code.isCode() && !code.isTemplate;
        })(codes),
        template: _.filter({ isTemplate: true })(codes),
        singleRef: _.flow(
          _.filter((code) => {
            return code.isSingleRef();
          }),
          _.map(_.omit("code"))
        )(codes),
        multiRefs: _.flow(
          _.filter((code) => {
            return code.isMultiRef();
          }),
          _.map(_.omit("code"))
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
  const codesToFileNames = _.mapValues(_.map((code) => {
    return code.fileName;
  }));

  return _.mapValues((group) => {
    // All of the indexes for ultimate references.
    const meta = {
      // Code indexes for this group.
      codeIdxs: _.flow(
        _.groupBy((code) => { return code.id; }),
        codesToFileNames
      )(group.code),

      // Unique internal/external code references for the group.
      singleRefIdxs: _.flow(
        _.groupBy((code) => { return code.singleRef; }),
        codesToFileNames
      )(group.singleRef),

      // External template references for the group.
      //
      // The **first** element of a multi-refs array
      // refers to a template that contains the code involved.
      multiRefsIdxs: _.flow(
        _.groupBy((code) => { return _.first(code.multiRefs); }),
        codesToFileNames
      )(group.multiRefs)
    };

    // More than one unique of _any_ means missed duplicates.
    meta.uniqIdxs = _.uniq([].concat(
      _.keys(meta.codeIdxs),
      _.keys(meta.singleRefIdxs),
      _.keys(meta.multiRefsIdxs)
    ));

    // Summary. Mostly for display.
    meta.summary = _.flow(
      _.map((idx) => {
        const codePath = meta.codeIdxs[idx]
          ? _.first(meta.codeIdxs[idx]) : null;

        return [idx, {
          source: codePath || "TEMPLATE",
          refs: _.uniq([].concat(
            meta.singleRefIdxs[idx] || [],
            meta.multiRefsIdxs[idx] || []
          ))
        }];
      }),

      _.fromPairs
    )(meta.uniqIdxs);

    return _.extend({ meta }, group);
  });
};

/**
 * Validate assumptions about groups and metadata.
 *
 * @return {Function}   Iterator for grouped object
 */
Bundle.prototype._validateGroups = function () {
  const codes = this.codes;

  /* eslint-disable max-statements */ // Validation can be long and tortured.
  return _.mapValues((group) => {
    // Templates: Should not have any code, ref, or refs.
    const tmplLen = group.template.length;
    if (group.template.length) {
      if (tmplLen !== 1) { // eslint-disable-line no-magic-numbers
        // Same base name should never have more than 1 template.
        throw new Error(`Found 2+ templates: ${ JSON.stringify(group)}`);
      } else if (group.code.length || group.singleRef.length || group.multiRefs.length) {
        throw new Error(`Found template with code|ref|refs: ${ JSON.stringify(group)}`);
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
    const extraRef = _.difference(group.meta.singleRefIdxs, group.meta.codeIdxs);
    if (extraRef.length === 1) { // eslint-disable-line no-magic-numbers
      // Look up and check the extra item.
      const singleExtraRef = _.first(extraRef);
      const singleRefItem = _.find({ id: singleExtraRef })(codes);
      if (!singleRefItem.isCode()) {
        throw new Error(`Found non-code reference: ${ JSON.stringify(singleRefItem)
          }\nFor: ${ JSON.stringify(group)}`);
      }
    } else if (extraRef.length > 1) { // eslint-disable-line no-magic-numbers
      throw new Error(`2+ extra ref indexes: ${ JSON.stringify(extraRef)
        }\nItem: ${ JSON.stringify(group)}`);
    }

    // Check multi-references.
    //
    // Here, we _can_ have 2+ templates, which are missed duplicates.
    const multiRefsIdxs = _.flow(
      _.map((code) => { return _.first(code.multiRefs); }),
      _.uniq
    )(group.multiRefs);

    if (multiRefsIdxs.length) {
      // Each refs index should be a template.
      _.each((refsIdx) => {
        const multiRefsItem = _.find({ id: refsIdx })(codes);
        if (!multiRefsItem.isTemplate) {
          throw new Error(`Found non-template reference: ${ JSON.stringify(multiRefsItem)
            }\nFor: ${ JSON.stringify(group)}`);
        }
      })(multiRefsIdxs);
    }

    return group;
  });
};

// Internal helper
const createBundle = (opts, callback) => {
  let bundle;
  try {
    bundle = new Bundle(opts);
  } catch (err) {
    err.message = `${(err.message || "")} ` +
      `(source code: ${opts.code.toString()}` +
      `${opts.bundle ? `, bundle path: ${opts.bundle}` : ""})`;
    return void callback(err);
  }

  try {
    bundle.validate();
  } catch (err) {
    return void callback(err);
  }

  callback(null, bundle);
};

/**
 * Create and validate bundle object from file.
 *
 * **Note**: Must build webpack bundle with:
 * - `output.pathinfo = true`
 * - No minification.
 *
 * @param {Object}    opts              Options
 * @param {String}    opts.bundle       Path to bundle file
 * @param {String}    opts.code         A raw string of a bundle
 * @param {Boolean}   opts.allowEmpty   Allow empty bundle?
 * @param {Function}  callback          Form `(err, data)`
 * @returns {void}
 */
Bundle.create = function (opts, callback) {
  // Mutate code into proper usable format.
  let code = opts.code;
  if (code && typeof code !== "string") {
    if (Buffer.isBuffer(code)) {
      code = code.toString();

    // Check and convert code type if weird `{ type: "Buffer", data: [INTEGERS] }`
    // https://github.com/FormidableLabs/webpack-dashboard/issues/193
    } else if (code.type === "Buffer" && Array.isArray(code.data)) {
      code = Buffer.from(code.data).toString();

    } else {
      throw new Error(`Unknown code type: ${typeof code}, source: ${code}`);
    }
  }

  // Validate. (Would be programming error).
  if (!opts.bundle && !code) {
    throw new Error("Bundle or code option required");
  }

  if (opts.bundle && code) {
    throw new Error("Bundle and code options are mutually exclusive");
  }

  if (code) {
    // Prevent Zalgo by executing on the next tick.
    return setImmediate(() => {
      createBundle({
        code,
        allowEmpty: opts.allowEmpty
      }, callback);
    });
  }

  return fs.readFile(opts.bundle, (readErr, data) => {
    if (readErr) {
      return void callback(readErr);
    }

    createBundle({
      path: opts.bundle,
      code: data.toString(),
      allowEmpty: opts.allowEmpty
    }, callback);
  });
};
