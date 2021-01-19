inspectpack
===========
[![npm version][npm_img]][npm_site]
[![Actions Status][actions_img]][actions_site]
[![Coverage Status][cov_img]][cov_site]
[![Maintenance Status][maintenance-image]](#maintenance-status)


An inspection tool for Webpack frontend JavaScript bundles.

`inspectpack` provides insight into your webpack-built JS bundles and detailed analysis of opportunites to reduce module sizes, unneeded duplicates, etc. It can be used as a webpack **plugin** during your compliations or as an **offline CLI tool** to report on your previous builds.

It is also the engine for the handy [`webpack-dashboard`](https://github.com/FormidableLabs/webpack-dashboard) plugin.

- [Plugin](#plugin)
- [Command line tool](#command-line-tool)
  - [`duplicates`](#duplicates)
  - [`versions`](#versions)
  - [`sizes`](#sizes)
- [Notes, tips, tricks](#notes-tips-tricks)
- [Other useful tools](#other-useful-tools)

## Plugin

The `DuplicatesPlugin` identifies unnecessarily duplicated code in your webpack bundles with an actionable report to help you trim down wasted bytes.

To get started, install the plugin:

```sh
$ npm install --save-dev inspectpack # OR
$ yarn add --dev inspectpack
```

Then, add the plugin to your `webpack.config.js` file:

```js
const { DuplicatesPlugin } = require("inspectpack/plugin");

module.exports = {
  // ...
  plugins: [
    // ...
    new DuplicatesPlugin({
      // Emit compilation warning or error? (Default: `false`)
      emitErrors: false,
      // Handle all messages with handler function (`(report: string)`)
      // Overrides `emitErrors` output.
      emitHandler: undefined,
      // List of packages that can be ignored. (Default: `[]`)
      // - If a string, then a prefix match of `{$name}/` for each module.
      // - If a regex, then `.test(pattern)` which means you should add slashes
      //   where appropriate.
      //
      // **Note**: Uses posix paths for all matching (e.g., on windows `/` not `\`).
      ignoredPackages: undefined,
      // Display full duplicates information? (Default: `false`)
      verbose: false
    })
  ]
};
```

And from there you'll get actionable reports!

### A quick tour

Let's see the plugin in action with a [quick scenario](https://github.com/FormidableLabs/inspectpack-duplicates-blog-examples/tree/master/scenarios/new-webpack/new-npm-unflattened) that has various duplicates from a simple [examples repository](https://github.com/FormidableLabs/inspectpack-duplicates-blog-examples). (_Side note_: we've got lots of other interesting inspection scenarios in our [test fixtures directory](https://github.com/FormidableLabs/inspectpack/tree/master/test/fixtures).)

#### The problem

In this scenario, we have an [application](https://github.com/FormidableLabs/inspectpack-duplicates-blog-examples/blob/master/scenarios/new-webpack/new-npm-unflattened/index.js) that imports a simplified, fake version of `lodash` in (1) the root application, (2) transitively via a `one` dependency, and (3) again via a `two` dependency. Abstractly, the dependency tree (with semver ranges from `pacakge.json`) looks like:

```yaml
- my-app:             # Resolved
  - lodash@^4.1.0     # 4.2.3
  - one@1.2.3:        # 1.2.3
    - lodash@^3.0.0   # 3.1.0
  - two@2.3.4:        # 2.3.4
    - lodash@^3.0.0   # 3.1.0
```

Using modern `npm` or `yarn` to install this project gives us the following on-disk `node_modules` folder (with version resolutions noted):

```bash
node_modules          # Resolved
  lodash              # 4.2.3
  one                 # 1.2.3
    node_modules
      lodash          # 3.1.0 (Cannot be collapsed)
  two                 # 2.3.4
    node_modules
      lodash          # 3.1.0 (Cannot be collapsed)
```

Looking to our resulting [bundle](https://github.com/FormidableLabs/inspectpack-duplicates-blog-examples/blob/master/scenarios/new-webpack/new-npm-unflattened/dist/bundle.js) we have the following duplicated code sources:

- `node_modules/lodash/index.js` (`4.2.3`): This code is **similar** to the code for `3.1.0`.
- `node_modules/one/node_modules/lodash/index.js`, `node_modules/two/node_modules/lodash/index.js`  (`3.1.0`): These two files are **identical** code sources. They are only included twice in the bundle because `npm`/`yarn` could not flatten the dependencies during installation.

So, we've got inefficient code that we discovered via a _manual_ inspection. Wouldn't it be nice to have a report that specifically highlighted problems like these with useful information?

... enter the `DuplicatesPlugin`.

#### Diagnosing duplicates

##### Simple report

With our plugin enabled in the standard configuration:

```js
new DuplicatesPlugin()
```

we get a summary report of the duplicates upon running the `webpack` command:

```
WARNING in Duplicate Sources / Packages - Duplicates found! ⚠️

* Duplicates: Found 2 similar files across 3 code sources (both identical + similar)
  accounting for 703 bundled bytes.
* Packages: Found 1 packages with 2 resolved, 3 installed, and 3 depended versions.

## bundle.js
lodash (Found 2 resolved, 3 installed, 3 depended. Latest 4.2.3.)
  3.1.0 ~/one/~/lodash
    scenario-new-webpack-new-npm-unflattened@* -> one@1.2.3 -> lodash@^3.0.0
  3.1.0 ~/two/~/lodash
    scenario-new-webpack-new-npm-unflattened@* -> two@2.3.4 -> lodash@^3.0.0
  4.2.3 ~/lodash
    scenario-new-webpack-new-npm-unflattened@* -> lodash@^4.1.0
```

Breaking down this report, we get a `webpack` "warning" emitted by default with an initial summary
of the report.

* The `Duplicates` summary looks at **what is in the `webpack` bundle**. It tells us there are 2 files that are not identical, but the same package file path (e.g `3.1.0` vs `4.2.3` for `lodash/index.js`) and that there are 3 code sources that end up in our final bundle (which includes _two_ for `3.1.0`). We also get a byte count for all the files at issue (`703` bytes), which presumably could roughly be cut by 2/3 if we could collapse to just **one** file to do the same thing.
* The `Packages` summary looks at **what `npm` installed to `node_modules`**. This is the other "view" into our problems.
    * _Terminology_: Let's dig in to what things mean here.
        * **Resolved**: We have one package (`lodash`) that has 2 resolved versions (`3.1.0` and `4.2.3`). A "resolution" means that upon inspecting the dependency tree and what's in a registry source, these specific versions "match". The results may differ at a different point in time
        * **Installed**: These are actual packages installed to the local disk. In our case, we have **three** installs for 2 resolutions because we place an identical version twice.
        * **Depended**: These are the number of upstream packages that create a dependency from a unique path in the graph to a package. Put more concretely, in our case, three unique `package.json` files have an entry for `lodash`.
            * _Note_: This is a bit of a complicated assessment, since aside from the root `package.json` the rest of the dependency graph depends on what is resolved at the next level to give a dependent `package.json` and so on recusively.
    * _`~` Note_: The `~` shorthand represents the `node_modules` folder, which is a common abbreviation for webpack tools. E.g., `~/two/~/lodash` really means `node_modules/two/node_modules/lodash`.
    * _Note - Duplicates Only_: Unlike the CLI `--action=versions` report, the `DuplicatesPlugin` only reports package version skews when there are **actual duplicated files** (either similar or identical). This means there may be multiple versions of a package with _different_ files as part of your bundle. If you'd like to see these, use the CLI reporting tool!

After the plugin runs, we get a duplicates/package report for asset (e.g. outputted "bundle" files) with duplicate packages that produce duplicate sources in our bundles in the form of:

```
## {ASSET_NAME}
{PACKAGE_NAME} (Found {NUM} resolved, {NUM} installed, {NUM} depended. Latest version {VERSION}.)
  {INSTALLED_PACKAGE_VERSION NO 1} {INSTALLED_PACKAGE_PATH NO 1}
    {DEPENDENCY PATH NO 1}
    {DEPENDENCY PATH NO 2}
    ...
  {INSTALLED_PACKAGE_VERSION NO 1} {INSTALLED_PACKAGE_PATH NO 2}
  ...
  {INSTALLED_PACKAGE_VERSION NO 2} {INSTALLED_PACKAGE_PATH NO 3}
  ...
```

Looking to our specific report for `lodash`, we see that we have:

* Two **installed** paths (`~/one/~/lodash`, `~/two/~/lodash`) for one **resolved** version (`3.1.0`). These are part of the dependency tree because of two **depended** paths:
    * `ROOT -> one@1.2.3 -> lodash@^3.0.0`
    * `ROOT -> two@2.3.4 -> lodash@^3.0.0`
* One **installed** path (`~/lodash`) for another **resolved** version (`4.2.3`). This is part of the dependency tree because of the one root **depended** path (`ROOT -> lodash@^4.1.0`).
* Take these numbers together and you get our summary of `2 resolved`, `3 installed`, and `3 depended` packages from our summary besides the package name.

Thus for actionable information, there is a naive "quick out" that if we could switch the root dependency _also_ to `^3.0.0` or something that resolves to `lodash@3.1.0` all three packages would collapse to one using modern `npm` or `yarn`!

#### Verbose report

But, let's say we want a little more information on the dependency tree besides the packages that end up on disk. For this, we can enable verbose output, which will include information on the bundled files that webpack is bringing in.

```js
new DuplicatesPlugin({
  verbose: true
})
```

Our resulting report is:

```
WARNING in Duplicate Sources / Packages - Duplicates found! ⚠️

* Duplicates: Found 2 similar files across 3 code sources (both identical + similar)
  accounting for 703 bundled bytes.
* Packages: Found 1 packages with 2 resolved, 3 installed, and 3 depended versions.

## bundle.js
lodash (Found 2 resolved, 3 installed, 3 depended. Latest 4.2.3.)
  3.1.0
    ~/one/~/lodash
      * Dependency graph
        scenario-new-webpack-new-npm-unflattened@* -> one@1.2.3 -> lodash@^3.0.0
      * Duplicated files in bundle.js
        lodash/index.js (I, 249)

    ~/two/~/lodash
      * Dependency graph
        scenario-new-webpack-new-npm-unflattened@* -> two@2.3.4 -> lodash@^3.0.0
      * Duplicated files in bundle.js
        lodash/index.js (I, 249)

  4.2.3
    ~/lodash
      * Dependency graph
        scenario-new-webpack-new-npm-unflattened@* -> lodash@^4.1.0
      * Duplicated files in bundle.js
        lodash/index.js (S, 205)
```

We've got the same summary and organization as our previous report, but now we additionally have the bundled code sources with some additional information. Let's look at our first one for `3.1.0 ~/one/~/lodash`:

```
lodash/index.js (I, 249)
```

this takes the form of:

```
{FILE_PATH} ({[I]DENTICAL or [S]IMILAR}, {NUMBER_OF_BYTES})
```

which means the file `index.js` from the `lodash` package is _identical_ to at least one other file in the bundle (the `I` designation) is `249` bytes in size.

Looking at the last one for `4.2.3 ~/lodash`:

```
lodash/index.js (S, 205)
```

we have the same file name as the others, but it is not identical to any other file in the bundle -- instead it is only _similar_ (the `S` designation) and is `205` bytes in size.

So now, with this verbose report we can see:

* The specific files in play that are duplicated sources in the bundle.
* Whether they have any _identical_  matches elsewhere in the bundle.
* The byte size (and hence the impact) of each source.

### Fixing bundle duplicates

Alright! The plugin has analyzed your `webpack` compilation and dumped out a lot of information about all the duplicate sources and packages. ... so what do we do about it?

The real-world answer is **it's complicated**.

Some things are relatively easy to fix. Others are not.

#### Focus first on identical code sources

For starters, if you're serious about fixing pre-existing duplicates in your bundle, run with the `verbose: true` option. What that gives you is a list of the identical sources used in the bundle. These pieces of code are completely equivalent, so there is a better chance that they will be able to be collapsed without any difference in functionality.

Of course, the complexity is that identical pieces of code may `require` or `import` other files that are **not** identical in bytes or even equivalent in functionality. So a replacement analysis might start with identical code sources, but must also include any _other_ depended-on sources. But hey, it's a decent place to start looking.

#### Change dependencies in your root `package.json`

For a few issues, you may be able to change a dependency you control, usually in your root `package.json` (or any other dependency you control). In our example above, if the root `package.json` downgraded its dependency to a semver range that resolved to `lodash@3.1.0` likely _all_ the duplicates for that mini-scenario would be solved.

#### Set `resolve.alias` in your `webpack` configuration

If you cannot resolve the dependencies in `package.json`s you control, you can have `webpack` do manual resolutions to a single package for you using the [`resolve.alias`](https://webpack.js.org/configuration/resolve/#resolve-alias) option in your `webpack.config.js` file.

A slight warning here in that you are probably creating a bundle wherein some code sources may end up using a dependency version that is **out** of their specified semantic version range.

#### Set the `resolutions` field with `yarn`

In parallel to `webpack` collapsing package references in the _bundle_, if you use the `yarn` package manager to install your dependencies, you can analogous collapse to single packages in your installed `node_modules` directory before `webpack` even enters the picture.

Specifying a [`resolutions`](https://yarnpkg.com/lang/en/docs/selective-version-resolutions/) field in your `package.json` allows fine-grain control over how packages with the same package dependency resolve to one or more actual version numbers.

Similar to `resolve.alias`, because you can get outside the guarantees of semantic versioning with this tool, be sure to check that your overall application supports the finalized code in the bundle.

## Command line tool

First, install (usually globally);

```sh
$ npm install -g inspectpack
```

From there, you can run the `inspectpack` command line tool from anywhere!

```sh
Usage: inspectpack -s <file> -a <action> [options]

Options:
  --action, -a            Actions to take
                [string] [required] [choices: "duplicates", "sizes", "versions"]
  --stats, -s             Path to webpack-created stats JSON object
                                                             [string] [required]
  --format, -f            Display output format
                     [string] [choices: "json", "text", "tsv"] [default: "text"]
  --ignored-packages, -i  List of package names (space separated) to ignore
                                                           [array] [default: []]
  --bail, -b              Exit non-zero if duplicates/versions results found
                                                      [boolean] [default: false]
  --help, -h              Show help                                    [boolean]
  --version, -v           Show version number                          [boolean]

Examples:
  inspectpack -s stats.json -a duplicates  Show duplicates files
  inspectpack -s stats.json -a versions    Show version skews in a project
  inspectpack -s stats.json -a sizes       Show raw file sizes
```

### Generating a stats object file

`inspectpack` ingests the webpack [`stats` object](https://webpack.js.org/api/stats/) from a compilation to analyze project bundles and generate reports. To create a stats file suitable for `inspectpack`'s `--stats|-s` flag you can add the following to your `webpack.config.js`:

```js
const { StatsWriterPlugin } = require("webpack-stats-plugin");

module.exports = {
  // ...
  plugins: [
    new StatsWriterPlugin({
      fields: ["assets", "modules"],
      stats: {
        source: true // Needed for webpack5+
      }
    })
  ]
};
```

This uses the [`webpack-stats-plugin`](https://github.com/FormidableLabs/webpack-stats-plugin) to output at least the `assets` and `modules` fields of the stats object to a file named `stats.json` in the directory specified in `output.path`. There are lots of various [options](https://github.com/FormidableLabs/webpack-stats-plugin#statswriterpluginopts) for the `webpack-stats-plugin` that may suit your particular webpack config better than this example.

> ℹ️ **Webpack 5+ Note**: If you are using webpack5+ you will need to enable the `{ source: true }` options for the `stats` field for the plugin to include sources in stats output. In webpack versions previous to 5, this was enabled by default. The field is needed for internal determination as to whether or not a module is a real source file or a "synthetic" webpack added entry.

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

Then the created `stats.json` object from the previous `webpack-stats-plugin` configuration will cause `inspectpack` to analyze **all** of the bundled files across **all** of the entry points. The `webpack-stats-plugin` can be configured to split up separate stats files if desired in any manner (including splitting per entry point), but this is a more advanced usage not included in this document.

### Actions

`inspectpack` can output reports in `json`, `text`, or `tsv` (tab-separated values for spreadsheets). Just pass these options to the `--format|-f` flag and get your information the way you want it!

#### `duplicates`

Detect if there are modules in your bundle that _should_ be deduplicated but aren't, meaning that you have the same code multiple times, inflating the size of your bundle.

Old versions of webpack used to deduplicate identical code segments in modules, but it no longer does so, relying instead on `npm` tree flattening. Unfortunately, `npm` may still resolve to multiple independent versions of an overall package that nonetheless contain _identical_ or _compatible_ duplicate modules in the ultimate bundle. The `inspectpack` `duplicates` actions shows you the instances in which this happens.

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
* The first level is a unique file name (here, `foo/index.js`). `inspectpack` considers all modules that resolve to a package path as potential "duplicates".
* Within our entry for a unique file path, we next have two "Files" comprising indexes `0` and `1`. Each file at this level corresponds to a unique code block. This means, e.g., that `node_modules/different-foo/node_modules/foo/index.js` (`0`) and `node_modules/foo/index.js` have _different_ sources (`1`).
* Within each "File" are 1+ "Sources". These comprise multiple modules with *identical* sources. This means that `node_modules/foo/index.js` is completely identical to `node_modules/uses-foo/node_modules/foo/index.js` in our example for index `1`.

A positive report for duplicates means that your identical sources are completely wasted bytes -- you're including literally the same code multiple times. And multiple matching file paths means you are **potentially** wasting bytes because the packages _may_ be able to be collapsed.

#### `versions`

The versions action is a bit more high-level and abstract than duplicates. Versions reports on multiple versions of packages installed in your `node_modules` tree that have version skews **and** have 2+ files included in your bundle under inspection. In this manner, `inspectpack` ignores all the multitudes of package versions skews of things that don't matter to your ultimate application or library.

* _Note - Duplicates_: The versions report includes any packages that result in 2+ files from different installs of a package in your bundle. However, that doesn't mean that they're necessarily _duplicate files_, like you would find in the `--action=duplicates` report. For example, if your bundle includes `lodash@3.0.0/get.js` and `lodash@4.0.0/has.js`, you _will_ get a versions report for the `lodash` versions, but would _not_ see these files listed in a duplicates report.

**Requirements**: In order to get an accurate report, you must run `inspectpack` from the project root where the base installed `node_modules` directory is located. You also need to have _installed_ all your `node_modules` there.

Let's create a versions report on a project with both scoped and unscoped packages:

```sh
$ inspectpack -s /PATH/TO/stats.json -a versions -f text
inspectpack --action=versions
=============================

## Summary
* Packages with skews:      2
* Total resolved versions:  4
* Total installed packages: 4
* Total depended packages:  5
* Total bundled files:      7

## `bundle.js`
* @scope/foo
  * 1.1.1
    * ~/@scope/foo
      * Num deps: 2, files: 2
      * scoped@1.2.3 -> @scope/foo@^1.0.9
      * scoped@1.2.3 -> flattened-foo@^1.1.0 -> @scope/foo@^1.1.1
  * 2.2.2
    * ~/uses-foo/~/@scope/foo
      * Num deps: 1, files: 1
      * scoped@1.2.3 -> uses-foo@^1.0.9 -> @scope/foo@^2.2.0
* foo
  * 3.3.3
    * ~/unscoped-foo/~/foo
      * Num deps: 1, files: 2
      * scoped@1.2.3 -> unscoped-foo@^1.0.9 -> foo@^3.3.0
  * 4.3.3
    * ~/unscoped-foo/~/deeper-unscoped/~/foo
      * Num deps: 1, files: 2
      * scoped@1.2.3 -> unscoped-foo@^1.0.9 -> deeper-unscoped@^1.0.0 -> foo@^4.0.0
```

Digging in to this report, we see:

* Each heading (e.g., `## bundle.js`) is per outputted asset.
* A top-level hierarchy of package names (`@scoped/foo` and `foo`).
* Within each package name, are _different_ installed versions found in the tree (e.g., `1.1.1` for `~/@scope/foo` and `2.2.2` for `~/uses-foo/~/@scope/foo`). These different versions are **actually installed** on disk within `node_modules` and not flattened.
* Within a version number (e.g. for `1.1.1`:`~/@scope/foo` we have `scoped@1.2.3 -> @scope/foo@^1.0.9` and `scoped@1.2.3 -> flattened-foo@^1.1.0 -> @scope/foo@^1.1.1`) we have listed the "logical" dependency hierarchy path of the full tree noted by semver _ranges_ from `package.json:dependencies` (`^1.0.9` and `^1.1.1`), that **are** flattened by `npm` to just one actual installed path (`node_modules/@scope/foo`).

The versions report thus gives us a functional view of how the dependencies in a project correspond to what's actually installed on disk in `node_modules`, allowing you to infer what packages / dependencies are causing potential wasteful duplicate modules to show up in your bundle.

#### `sizes`

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

##### _Note_: Source size calculations and the webpack lifecycle

The sizes reported are most likely of the uncompressed source of each module. Because `inspectpack` relies on the `stats` object output, the information reported in the sizes action reflects at what point the `stats` object was generated. For example, using the recommended `webpack-stats-plugin`, the source information would be after all loader processing, but potentially before any webpack plugins. Thus, the resultant, _actual_ size of a given module in your ultimate bundle could be bigger (e.g., in a development bundle with webpack-inserted comments and imports) or smaller (e.g., your bundle is minified and gzipped).

## Notes, tips, tricks

### Special characters in file paths

Webpack loaders use a special syntax for loaders with `?` and `!` characters that will end up in the stats object `identifier` field (e.g., `/PATH/TO/node_modules/css-loader/index.js??ref--7-1!/PATH/TO/node_modules/postcss-loader/lib/index.js??ref--7-2!/PATH/TO/src/bar/my-style.css"`) for a given module item.

We currently use a very naive solution to determine the "true" asset name by just stripping off everything before the last `?`/`!` character. There are technically some potential use cases (e.g. those characters in real file paths) that might not be correctly handled. We have a [tracking ticket](https://github.com/FormidableLabs/inspectpack/issues/98) for folks to comment on if you're hitting any issues.

## Other useful tools

Other tools that inspect Webpack bundles:

* [webpack-bundle-size-analyzer](https://github.com/robertknight/webpack-bundle-size-analyzer)
* [webpack-visualizer](https://github.com/chrisbateman/webpack-visualizer)
* [webpack-chart](https://github.com/alexkuz/webpack-chart)

## Maintenance Status

**Active:** Formidable is actively working on this project, and we expect to continue for work for the foreseeable future. Bug reports, feature requests and pull requests are welcome.

[npm_img]: https://badge.fury.io/js/inspectpack.svg
[npm_site]: http://badge.fury.io/js/inspectpack
[actions_img]: https://github.com/FormidableLabs/inspectpack/workflows/CI/badge.svg
[actions_site]: https://github.com/FormidableLabs/inspectpack/actions
[cov]: https://codecov.io
[cov_img]: https://codecov.io/gh/FormidableLabs/inspectpack/branch/master/graph/badge.svg
[cov_site]: https://codecov.io/gh/FormidableLabs/inspectpack
[maintenance-image]: https://img.shields.io/badge/maintenance-active-green.svg

