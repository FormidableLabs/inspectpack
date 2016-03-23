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
  --action, -a    Actions to take                        [string] [required] [choices: "duplicates"]
  --bundle, -b    Path to webpack-created JS bundle                                         [string]
  --format, -f    Display output format         [string] [choices: "json", "text"] [default: "text"]
  --verbose       Verbose output                                          [boolean] [default: false]
  --minified, -m  Calculate / display minified byte sizes                 [boolean] [default: false]
  --help, -h      Show help                                                                [boolean]
  --version, -v   Show version number                                                      [boolean]

Examples:
  inspectpack --action=duplicates                     Report duplicates that cannot be deduped
  --bundle=bundle.js
```


## Inputs

The are three potential sources of input for bundle analysis:

* Stats: A metadata file of build / size information generated by Webpack
* Source Maps: The source mappings file for a bundle
* Bundle: And of course, the JS bundle itself.

Additionally, specific analysis steps also may require designated Webpack
configurations to produce a proper input.


## Actions

### `duplicates`

Detect if there are libraries that _should_ be de-duplicated with the
`webpack.optimize.DedupePlugin` but are not because of version mismatches.

**Webpack configuration**:

* Enable deduplication: `plugins:webpack.optimize.DedupePlugin()`
* Disable minification: We need the comment headers.
* Enable output path comments: `output.pathinfo = true`.

**Inputs**: Create a JavaScript bundle

```sh
$ webpack
```

**Analyze**:

```sh
$ inspectpack --action=duplicates --bundle=bundle.js
```

**Outputs**: A JSON or text report.

Example:

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

* The vast majority of the analysis time is spent minifying duplicate code
  snippets and the entire bundle. For just a list of missed duplicates, add
  the `--minified=false` flag.


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
