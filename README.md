inspectpack
===========
[![npm version][npm_img]][npm_site]
[![Travis Status][trav_img]][trav_site]
[![AppVeyor Status][appveyor_img]][appveyor_site]
[![Coverage Status][cov_img]][cov_site]

An inspection tool for Webpack frontend JavaScript bundles.

`inspectpack` provides insight into your webpack-built JS bundles and detailed
analysis of opportunites to reduce module sizes, unneeded duplicates, etc. It is
also the engine for the handy
[`webpack-dashboard`](https://github.com/FormidableLabs/webpack-dashboard)
plugin.

## Install

```sh
$ npm install -g inspectpack
```

## Usage

```sh
Usage: inspectpack -s <file> -a <action> [options]

Options:
  --action, -a   Actions to take
                [string] [required] [choices: "duplicates", "sizes", "versions"]
  --stats, -s    Path to webpack-created stats JSON object   [string] [required]
  --format, -f   Display output format
                     [string] [choices: "json", "text", "tsv"] [default: "text"]
  --help, -h     Show help                                             [boolean]
  --version, -v  Show version number                                   [boolean]

Examples:
  inspectpack -s stats.json -a duplicates  Show duplicates files
  inspectpack -s stats.json -a versions    Show version skews in a project
  inspectpack -s stats.json -a sizes       Show raw file sizes
```

### Generating a stats object file

`inspectpack` ingests the webpack [`stats`
object](https://webpack.js.org/api/stats/) from a compilation to analyze project
bundles and generate reports. To create a stats file suitable for
`inspectpack`'s `--stats|-s` flag you can add the following to your
`webpack.config.js`:

```js
const { StatsWriterPlugin } = require("webpack-stats-plugin");

module.exports = {
  // ...
  plugins: [
    new StatsWriterPlugin({
      fields: ["assets", "modules"]
    })
  ]
};
```

This uses the
[`webpack-stats-plugin`](https://github.com/FormidableLabs/webpack-stats-plugin)
to output at least the `assets` and `modules` fields of the stats object to a
file named `stats.json` in the directory specified in `output.path`. There are
lots of various
[options](https://github.com/FormidableLabs/webpack-stats-plugin#statswriterpluginopts)
for the `webpack-stats-plugin` that may suit your particular webpack config
better than this example.

#### _Note_: Multiple entry points

If you configure `entry` with multiple entry points like:

```js
module.exports = {
  entry: {
    foo: "./src/foo.js",
    bar: "./src/bar.js",
  }
};
```

Then the created `stats.json` object from the previous `webpack-stats-plugin`
configuration will cause `inspectpack` to analyze **all** of the bundled files
across **all** of the entry points. The `webpack-stats-plugin` can be configured
to split up separate stats files if desired in any manner (including splitting
per entry point), but this is a more advanced usage not included in this
document.

## Actions

`inspectpack` can output reports in `json`, `text`, or `tsv` (tab-separated
values for spreadsheets). Just pass these options to the `--format|-f` flag and
get your information the way you want it!

### `duplicates`

Detect if there are modules in your bundle that _should_ be deduplicated but
aren't, meaning that you have the same code multiple times, inflating the size
of your bundle.

Old versions of webpack used to deduplicate identical code segments in modules,
but it no longer does so, relying instead on `npm` tree flattening.
Unfortunately, `npm` may still resolve to multiple independent versions of an
overall package that nonetheless contain _identical_ or _compatible_ duplicate
modules in the ultimate bundle. The `inspectpack` `duplicates` actions shows you
the instances in which this happens.

Let's see a duplicates report in action:

```sh
$ inspectpack -s /PATH/TO/stats.json -a duplicates -f text
inspectpack --action=duplicates
===============================

## Summary
* Extra Files (unique):         2
* Extra Sources (non-unique):   3
* Extra Bytes (non-unique):     172

## `bundle.js`
* foo/index.js
  * Meta: Files 2, Sources 3, Bytes 172
  0. (Files 1, Sources 1, Bytes 64)
    (64) /PATH/TO/MY_PROJECT/node_modules/different-foo/node_modules/foo/index.js
  1. (Files 1, Sources 2, Bytes 108)
    (54) /PATH/TO/MY_PROJECT/node_modules/foo/index.js
    (54) /PATH/TO/MY_PROJECT/node_modules/uses-foo/node_modules/foo/index.js
```

Let's decipher the report:

* Each heading (e.g., `## bundle.js`) is per outputted asset.
* The first level is a unique file name (here, `foo/index.js`). `inspectpack`
  considers all modules that resolve to a package path as potential
  "duplicates".
* Within our entry for a unique file path, we next have two "Files" comprising
  indexes `0` and `1`. Each file at this level corresponds to a unique code
  block. This means, e.g., that
  `node_modules/different-foo/node_modules/foo/index.js` (`0`) and
  `node_modules/foo/index.js` have _different_ sources (`1`).
* Within each "File" are 1+ "Sources". These comprise multiple modules with
  *identical* sources. This means that `node_modules/foo/index.js` is completely
  identical to `node_modules/uses-foo/node_modules/foo/index.js` in our example
  for index `1`.

A positive report for duplicates means that your identical sources are
completely wasted bytes -- you're including literally the same code multiple
times. And multiple matching file paths means you are **potentially** wasting
bytes because the packages _may_ be able to be collapsed.

### `versions`

The versions action is a bit more high-level and abstract than duplicates.
Versions reports on multiple versions of packages installed in your
`node_modules` tree that have version skews **and** have 2+ files included in
your bundle under inspection. In this manner, `inspectpack` ignores all the
multitudes of package versions skews of things that don't matter to your
ultimate application or library.

**Requirements**: In order to get an accurate report, you must run `inspectpack`
from the project root where the base installed `node_modules` directory is
located. You also need to have _installed_ all your `node_modules` there.

Let's create a versions report on a project with both scoped and unscoped
packages:

```sh
$ inspectpack -s /PATH/TO/stats.json -a versions -f text
inspectpack --action=versions
=============================

## Summary
* Packages w/ Skews:        2
* Total skewed versions:    4
* Total depended packages:  5
* Total bundled files:      7

## `bundle.js`
* @scope/foo
  * 1.1.1
    * ~/@scope/foo
      * Num deps: 2, files: 2
      * scoped@1.2.3 -> @scope/foo@1.1.1
      * scoped@1.2.3 -> flattened-foo@1.1.1 -> @scope/foo@1.1.1
  * 2.2.2
    * ~/uses-foo/~/@scope/foo
      * Num deps: 1, files: 1
      * scoped@1.2.3 -> uses-foo@1.1.1 -> @scope/foo@2.2.2
* foo
  * 3.3.3
    * ~/unscoped-foo/~/foo
      * Num deps: 1, files: 2
      * scoped@1.2.3 -> different-foo@1.1.1 -> foo@3.3.3
  * 4.3.3
    * ~/unscoped-foo/~/deeper-unscoped/~/foo
      * Num deps: 1, files: 2
      * scoped@1.2.3 -> different-foo@1.1.1 -> deeper-unscoped@1.1.1 -> foo@4.3.3
```

Digging in to this report, we see:

* Each heading (e.g., `## bundle.js`) is per outputted asset.
* A top-level hierarchy of package names (`@scoped/foo` and `foo`).
* Within each package name, are _different_ installed versions found in the tree
  (e.g., `1.1.1` for `~/@scope/foo` and `2.2.2` for `~/uses-foo/~/@scope/foo`).
  These different versions are **actually installed** on disk within
  `node_modules` and not flattened.
* Within a version number (e.g. for `1.1.1`:`~/@scope/foo` we have
  `duplicates-cjs@1.2.3 -> @scope/foo@1.1.1` and `duplicates-cjs@1.2.3 ->
  flattened-foo@1.1.1 -> @scope/foo@1.1.1`) we have listed the "logical"
  dependency hierarchy path of the full tree, that **is** flattened by `npm`
  to just one actual installed path.

The versions report thus gives us a functional view of how the dependencies in a
project correspond to what's actually installed on disk in `node_modules`,
allowing you to infer what packages / dependencies are causing potential
wasteful duplicate modules to show up in your bundle.

### `sizes`

Sizes produces a simple report of the byte size of each module in a bundle.

Let's create a sizes report using one of the projects we used before:

```sh
$ inspectpack -s /PATH/TO/stats.json -a sizes -f text
inspectpack --action=sizes
==========================

## Summary
* Bytes: 9892

## `bundle.js`
* Bytes: 9892
* /PATH/TO/MY_PROJECT/node_modules/@scope/foo/bike.js
  * Size: 63
* /PATH/TO/MY_PROJECT/node_modules/@scope/foo/index.js
  * Size: 54
* /PATH/TO/MY_PROJECT/node_modules/bar/index.js
  * Size: 54
* /PATH/TO/MY_PROJECT/node_modules/bar/tender.js
  * Size: 69
* /PATH/TO/MY_PROJECT/node_modules/flattened-foo/index.js
  * Size: 103
* /PATH/TO/MY_PROJECT/node_modules/unscoped-foo/index.js
  * Size: 297
* /PATH/TO/MY_PROJECT/node_modules/unscoped-foo/node_modules/deeper-unscoped/index.js
  * Size: 182
* /PATH/TO/MY_PROJECT/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/car.js
  * Size: 61
* /PATH/TO/MY_PROJECT/node_modules/unscoped-foo/node_modules/deeper-unscoped/node_modules/foo/index.js
  * Size: 64
* /PATH/TO/MY_PROJECT/node_modules/unscoped-foo/node_modules/foo/car.js
  * Size: 61
* /PATH/TO/MY_PROJECT/node_modules/unscoped-foo/node_modules/foo/index.js
  * Size: 64
* /PATH/TO/MY_PROJECT/node_modules/uses-foo/index.js
  * Size: 98
* /PATH/TO/MY_PROJECT/node_modules/uses-foo/node_modules/@scope/foo/index.js
  * Size: 54
* /PATH/TO/MY_PROJECT/src/index.js
  * Size: 655
```

#### _Note_: Source size calculations and the webpack lifecycle

The sizes reported are most likely of the uncompressed source of each module.
Because `inspectpack` relies on the `stats` object output, the information
reported in the sizes action reflects at what point the `stats` object was
generated. For example, using the recommended `webpack-stats-plugin`, the source
information would be after all loader processing, but potentially before any
webpack plugins. Thus, the resultant, _actual_ size of a given module in your
ultimate bundle could be bigger (e.g., in a development bundle with
webpack-inserted comments and imports) or smaller (e.g., your bundle is minified
and gzipped).

## Other useful tools

Other tools that inspect Webpack bundles:

* [webpack-bundle-size-analyzer](https://github.com/robertknight/webpack-bundle-size-analyzer)
* [webpack-visualizer](https://github.com/chrisbateman/webpack-visualizer)
* [webpack-chart](https://github.com/alexkuz/webpack-chart)

[npm_img]: https://badge.fury.io/js/inspectpack.svg
[npm_site]: http://badge.fury.io/js/inspectpack
[trav_img]: https://api.travis-ci.org/FormidableLabs/inspectpack.svg
[trav_site]: https://travis-ci.org/FormidableLabs/inspectpack
[appveyor_img]: https://ci.appveyor.com/api/projects/status/github/formidablelabs/inspectpack?branch=master&svg=true
[appveyor_site]: https://ci.appveyor.com/project/FormidableLabs/inspectpack
[cov]: (https://codecov.io
[cov_img]: https://codecov.io/gh/FormidableLabs/inspectpack/branch/master/graph/badge.svg
[cov_site]: https://codecov.io/gh/FormidableLabs/inspectpack
