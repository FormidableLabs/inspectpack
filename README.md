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
  --action       Actions to take                                                            [string]
  --stats, -s    Path to transform webpack `--stats` file                                   [string]
  --format       Display output format          [string] [choices: "json", "text"] [default: "json"]
  -h, --help     Show help                                                                 [boolean]
  -v, --version  Show version number                                                       [boolean]
```

[trav_img]: https://api.travis-ci.org/FormidableLabs/inspectpack.svg
[trav_site]: https://travis-ci.org/FormidableLabs/inspectpack
[cov]: https://coveralls.io
[cov_img]: https://img.shields.io/coveralls/FormidableLabs/inspectpack.svg
[cov_site]: https://coveralls.io/r/FormidableLabs/inspectpack
