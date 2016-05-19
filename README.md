[![Travis Status][trav_img]][trav_site]
<!--[![Coverage Status][cov_img]][cov_site]-->

inspectpack
===========

An inspection tool for Webpack frontend JavaScript bundles.

Inspectpack gives insight into what's in your production JS bundles and where
you can cut down on size, duplicates, etc.


## Install

```sh
$ npm install inspectpack
```


## Usage

```
An inspection tool for Webpack frontend JavaScript bundles.

Usage: inspectpack --action=<string> [options]

Options:
  --action, -a        Actions to take
                            [string] [required] [choices: "duplicates", "files", "parse", "pattern"]
  --bundle, -b        Path to webpack-created JS bundle                                     [string]
  --format, -f        Display output format
                                         [string] [choices: "json", "text", "tsv"] [default: "text"]
  --verbose           Verbose output                                      [boolean] [default: false]
  --minified, -m      Calculate / display minified byte sizes              [boolean] [default: true]
  --gzip, -g          Calculate / display minified + gzipped byte size (implies `--minified`)
                                                                           [boolean] [default: true]
  --pattern, -p       Regular expression string(s) to match on                 [array] [default: []]
  --path              Path to input file(s)                                    [array] [default: []]
  --suspect-patterns  Known 'suspicious' patterns for `--action=pattern`                   [boolean]
  --suspect-parses    Known 'suspicious' code parses for `--action=parse`                  [boolean]
  --suspect-files     Known 'suspicious' file names for `--action=files`                   [boolean]
  --help, -h          Show help                                                            [boolean]
  --version, -v       Show version number                                                  [boolean]

Examples:
  inspectpack --action=duplicates --bundle=bundle.js  Report duplicates that cannot be deduped
  inspectpack --action=pattern --bundle=bundle.js     Show files with pattern matches in code
  --suspect-patterns
  inspectpack --action=parse --bundle=bundle.js       Show files with parse function matches in code
  --suspect-parses
  inspectpack --action=files --bundle=bundle.js       Show files with pattern matches in file names
  --suspect-files
```


## Inputs

The are three potential sources of input for bundle analysis:

* Stats: A metadata file of build / size information generated by Webpack
* Source Maps: The source mappings file for a bundle
* Bundle: And of course, the JS bundle itself.

Additionally, specific analysis steps also may require designated Webpack
configurations to produce a proper input.

### Bundle

If an `inspectpack` action requires a `--bundle`, create one as follows:

**Webpack configuration**:

* Enable deduplication: `plugins:webpack.optimize.DedupePlugin()`
* Disable minification: We need the comment headers.
* Enable output path comments: `output.pathinfo = true`.

**Inputs**: Create a JavaScript bundle

```sh
$ webpack
```

The created JS bundle path is ready to use. (Note that code split chunks should
work same as a single root bundle, but we haven't tested this yet.)


## Actions

### `duplicates`

Detect if there are libraries that _should_ be de-duplicated with the
`webpack.optimize.DedupePlugin` but are not because of version mismatches.

First create a [bundle](#bundle). Then run:


```sh
$ inspectpack --action=duplicates --bundle=bundle.js
```

**Outputs**: A JSON, text, or tab-separate-value report. For example:

```
## Summary

* Bundle:
    * Path:                /PATH/TO/bundle.js
    * Bytes (min):         1678533
* Missed Duplicates:
    * Num Unique Files:    116
    * Num Extra Files:     131
    * Extra Bytes (min):   253955
    * Pct of Bundle Size:  15 %
```

* Number of unique files with missed duplicates.
* Number of total files that _could_ be removed. This is different from the
  previous number because you may have 3+ duplicates of a unique file path
  that cannot be deduplicated.
* Minified byte size of the extra files. Note that we choose the "minimum
  possible code size" to be the lowest of all file sizes for a given unique
  file name.

**Notes**:

* The vast majority of the analysis time is spent minifying and gzipping
  duplicate code snippets and the entire bundle. For just a list of missed
  duplicates, add the `--minified=false --gzip=false` flags.

### `parse`

Detect the occurrence of 1+ code parse function matches in code sections of the
bundle. This is another means of detecting anti-patterns, some of which we
aggregate in `--suspect-parses`.

_Note_: This is simply a more abstract version of `pattern` where you could have
a parse function that uses the same regex to match a code snippet manually. What
this feature really opens up is full Babel traversals / introspection, which are
more correct and flexible than anything regular expressions can do. In our
`--suspect-parses` collection, we use babel introspection to very tightly
determine if there are multiple exports in any source code file in a bundle.

First create a [bundle](#bundle).

Next, decide if using provided `--suspect-parses` or your own custom parse
functions with one or more file paths to `--path`. A parse function should
follow these guidelines:

```js
/**
 * Check if source matches selection criteria.
 *
 * @param   {String}      src Source code snippet
 * @returns {String|null}     String snippet match or falsy if no match
 */
module.exports = function (src) {
  // Find a occurrences of token "first" and return containing line.
  return (src.match(/^.*first.*$/m) || [])[0];
};
```

In this simple example, we're just using regular expresssions, but for complex
projects / investigations you'll likely want to step up to some Babel magic.

Then run:

```sh
# A custom parse file
$ inspectpack \
  --action=parse --bundle=bundle.js \
  --path=/PATH/TO/parse.js

# Suspect parses
$ inspectpack \
  --action=parse --bundle=bundle.js \
  --suspect-parses
```

**Suspect Parses**: The `--suspect-parses` flag looks for known "suspect"
code snippets that potentially contain inefficient code. See
[the source code](lib/actions/parse.js) for the full breakdown of
`SUSPECT_PARSES`.

* `MULTIPLE_EXPORTS`: Multiple exports via any number export objects /
  statements.

    ```js
    // Single object.
    module.exports = {
      foo: __webpack_require__(1),
      bar: __webpack_require__(2)
    }

    // Multiple statements.
    module.exports.foo = __webpack_require__(1);
    module.exports.bar = __webpack_require__(2);
    ```

**Outputs**: A JSON, text, or tab-separate-value report. For example:

```
$ inspectpack \
  --action=parse \
  --bundle="/PATH/TO/bundle.js" \
  --format=text \
  --suspect-parses
inspectpack --action=parse
============================

## Summary

* Bundle:
    * Path:                /Users/rye/scm/fmd/simple-proj/dist/bundle.js
    * Num Matches:         3
    * Num Unique Files:    3
    * Num All Files:       3
    * Custom Parses:
    * Suspect Parses:
        * MULTIPLE_EXPORTS

## Matches

* ./lib/mod-a.js
    * Num Matches:         1
    * Num Files Matched:   1

    * 1: ./lib/mod-a.js
        * Matches: 1
            * MULTIPLE_EXPORTS:
                module.exports = {
                  first: __webpack_require__(/*! ./first */ 2),
                  second: __webpack_require__(/*! ./second */ 3)
                };


* ./lib/mod-b.js
    * Num Matches:         1
    * Num Files Matched:   1

    * 4: ./lib/mod-b.js
        * Matches: 1
            * MULTIPLE_EXPORTS:
                module.exports.first = __webpack_require__(/*! ./first */ 2);
              // ...
                module.exports.second = __webpack_require__(/*! ./second */ 3);
```

### `pattern`

Detect the occurrence of 1+ patterns in code sections of the bundle. This is
useful for detecting anti-patterns, some of which we aggregate in a useful
option `--suspect-patterns`.

_Note_: There is a good deal of overlap with `parse` in suspect patterns, were
we're doing the same thing with different approaches (code parsing vs regex
grepping). In general, parsing is far more powerful and correct. But, there's
always a use for quick and dirty regular expressions which we discuss further
in this section.

First create a [bundle](#bundle). Then run:


```sh
# A single pattern
$ inspectpack \
  --action=pattern --bundle=bundle.js \
  --pattern="201[56]"

# Multiple patterns
$ inspectpack \
  --action=pattern --bundle=bundle.js \
  --pattern "2016" "unicorn"

# Suspect patterns
$ inspectpack \
  --action=pattern --bundle=bundle.js \
  --suspect-patterns
```

**Notes**:

* It is best to use quotes around patterns so that you don't have to escape
  shell processing.
* Some regular expressions can be very expensive time-wise, so be sure to try
  things out a bit and refactor your patterns if the inspection is taking too
  long.

**Suspect Patterns**: The `--suspect-patterns` flag looks for known "suspect"
patterns that potentially contain inefficient code. See
[the source code](lib/actions/pattern.js) for the full breakdown of
`SUSPECT_PATTERNS`.

* `MULTIPLE_EXPORTS_SINGLE`: Multiple exports via one export object.

    ```js
    module.exports = {
      foo: __webpack_require__(1),
      bar: __webpack_require__(2)
    }
    ```

* `MULTIPLE_EXPORTS_MUTIPLE`: Multiple exports via 2+ export statements.

    ```js
    module.exports.foo = __webpack_require__(1);
    module.exports.bar = __webpack_require__(2);
    ```

**Outputs**: A JSON, text, or tab-separate-value report. For example:

```
$ inspectpack \
  --action=pattern \
  --bundle="/PATH/TO/bundle.js" \
  --format=text \
  --suspect-patterns

## Summary

* Bundle:
    * Path:                /PATH/TO/bundle.js
    * Num Matches:         17
    * Num Unique Files:    14
    * Num All Files:       17
    * Custom Patterns:
    * Suspect Patterns:
        * MULTIPLE_EXPORTS_SINGLE: [^\n]*(module\.|)exports\s*=\s*{(\s*.*__webpack_require__\(.*){2}
        * MULTIPLE_EXPORTS_MUTIPLE: [^\n]*((module\.|)exports\..*\s*=\s*.*__webpack_require__\(.*\s*){2}

## Matches

* custom-lib/lib/index.js
    * Num Matches:         1
    * Num Files Matched:   1

    * 1103: ../~/custom-lib/lib/index.js
        * Matches: 1
            * MULTIPLE_EXPORTS_SINGLE - /[^\n]*(module\.|)exports\s*=\s*{(\s*.*__webpack_require__\(.*){2}/:
                module.exports = {
                  Foo: __webpack_require__(/*! ./components/foo */ 1104),
                  Bar: __webpack_require__(/*! ./components/bar */ 1135),

* lodash/string.js
    * Num Matches:         1
    * Num Files Matched:   1

    * 1581: ../~/lodash/string.js
        * Matches: 1
            * MULTIPLE_EXPORTS_SINGLE - /[^\n]*(module\.|)exports\s*=\s*{(\s*.*__webpack_require__\(.*){2}/:
                module.exports = {
                  'camelCase': __webpack_require__(/*! ./string/camelCase */ 1582),
                  'capitalize': __webpack_require__(/*! ./string/capitalize */ 1587),


* lodash/lang.js
    * Num Matches:         1
    * Num Files Matched:   1

    * 1862: ../~/lodash/lang.js
        * Matches: 1
            * MULTIPLE_EXPORTS_SINGLE - /[^\n]*(module\.|)exports\s*=\s*{(\s*.*__webpack_require__\(.*){2}/:
                module.exports = {
                  'clone': __webpack_require__(/*! ./lang/clone */ 1863),
                  'cloneDeep': __webpack_require__(/*! ./lang/cloneDeep */ 1869),
```

### `files`

Detect the occurrence of 1+ files by the base name (resolved from
`node_modules`). This is useful for detecting anti-patterns based on files that
should _never_ be part of a webpack bundle. We aggregate useful file patterns
in the option `--suspect-files`.

First create a [bundle](#bundle). Then run:

```sh
# A single file pattern
$ inspectpack \
  --action=files --bundle=bundle.js \
  --pattern="underscore"

# Multiple file patterns
$ inspectpack \
  --action=files --bundle=bundle.js \
  --pattern "underscore" "jquery"

# Suspect files
$ inspectpack \
  --action=files --bundle=bundle.js \
  --suspect-files
```

**Suspect Files**: The `--suspect-files` flag looks for known "suspect"
file patterns that potentially contain inefficient code. See
[the source code](lib/actions/files.js) for the full breakdown of
`SUSPECT_FILES`.

* `LODASH`: Known lodash files that have multiple exports. You should instead
  import "one-off" files.
* `MOMENT_LOCALE_ROOT`: A webpack pattern that signals _every_ possible locale
  is bundled in your application. You should instead hone down and include
  only the locales that you specifically need for your application.

**Outputs**: A JSON, text, or tab-separate-value report. For example:

```
inspectpack --action=files
==========================

## Summary

* Bundle:
    * Path:                /PATH/TO/bundle.js
    * Num Matches:         4
    * Num Files:           4
    * Custom Patterns:
        * underscore\/
    * Suspect Patterns:
        * LODASH: lodash/(index|lodash|lodash\.min|array|collection|date|function|lang|math|number|object|seq|string|util)\.js
        * MOMENT_LOCALE_ROOT: moment\/locale \^\\\.\\\/\.\*\$

## Files
    * lodash/index.js
    * underscore/underscore.js
    * lodash/lang.js
    * moment/locale ^\.\/.*$

## Matches

* lodash/index.js
    * Matches:            1
        * LODASH - /lodash\/(index|lodash|lodash\.min|array|collection|date|function|lang|math|number|object|seq|string|util)\.js/: lodash/index.js
    * Refs:
        * 1400: ../~/foo/~/lodash/index.js

* underscore/underscore.js
    * Matches:            1
        * CUSTOM - /underscore\//: underscore/
    * Refs:
        * 2650: ../~/bar/~/underscore/underscore.js

* lodash/lang.js
    * Matches:            1
        * LODASH - /lodash\/(index|lodash|lodash\.min|array|collection|date|function|lang|math|number|object|seq|string|util)\.js/: lodash/lang.js
    * Refs:
        * 2820: ../~/baz/~/lodash/lang.js

* moment/locale ^\.\/.*$
    * Matches:            1
        * MOMENT_LOCALE_ROOT - /moment\/locale \^\\\.\\\/\.\*\$/: moment/locale ^\.\/.*$
    * Refs:
        * 2855: ../~/moment/locale ^\.\/.*$
```


## Other Useful Tools

Other tools that inspect Webpack bundles:

* [webpack-bundle-size-analyzer](https://github.com/robertknight/webpack-bundle-size-analyzer)
* [webpack-visualizer](https://github.com/chrisbateman/webpack-visualizer)
* [webpack-chart](https://github.com/alexkuz/webpack-chart)

[trav_img]: https://api.travis-ci.org/FormidableLabs/inspectpack.svg
[trav_site]: https://travis-ci.org/FormidableLabs/inspectpack
[cov]: https://coveralls.io
[cov_img]: https://img.shields.io/coveralls/FormidableLabs/inspectpack.svg
[cov_site]: https://coveralls.io/r/FormidableLabs/inspectpack
