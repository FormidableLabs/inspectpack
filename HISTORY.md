History
=======

## 4.7.1

* Bug: Fix plugin types.
  [#161](https://github.com/FormidableLabs/inspectpack/issues/161)

## 4.7.0

* Feature: Include TypeScript definitions. (*[jensbodal][]*)
  [#76](https://github.com/FormidableLabs/inspectpack/issues/76)

## 4.6.1

* Internal: Refactor object merging to avoid unnecessary destructuring.

## 4.6.0

* Feature: Add webpack5 support.
  [#156](https://github.com/FormidableLabs/inspectpack/issues/156)
* Test: Change handling of tree-shaking supported fixtures to compare production on v4+ and dev vs prod on v3-.
* Test: Remove `expose-loader` from `loaders` test scenario as just wasn't working on windows + v5.

## 4.5.2

* Internal: Optimize `shouldBail` to used cached `getData()`.

## 4.5.1

* Feature: Add `--bail` option for `--action duplicates|versions`.
  [#138](https://github.com/FormidableLabs/inspectpack/issues/138) (*[alexander-schranz][]*)
* Test: Refactor internal test script commands.
* Test: Add actual process execs for `bin` tests.
* Various dependency updates.

## 4.4.0

* Add `ignoredPackages` plugin option (string or regex) and `--ignored-packages|-i` CLI option (string) to ignore packages in respective outputs.
  [#132](https://github.com/FormidableLabs/inspectpack/issues/132) (*[@tido64][]*)

## 4.3.1

* BUG: Handle circular dependencies recursion issue in `versions`.
  [#128](https://github.com/FormidableLabs/inspectpack/issues/128)

## 4.3.0

* Use `source` string length over `size` reported from Webpack stats for assessing real size of source.
* Remove `*.map` files from published npm package.
* Upgrade prod and dev dependencies, including TypeScript (to `3.7.4`).

## 4.2.2

* Update `yargs` for security.
  [#118](https://github.com/FormidableLabs/inspectpack/issues/118)
* TEST: Upgrade `mock-fs` to allow modern Nodes. Update Travis + Appveyor.
  [#83](https://github.com/FormidableLabs/inspectpack/issues/83)
  [#94](https://github.com/FormidableLabs/inspectpack/issues/94)

## 4.2.1

* BUG: Handle `null` chunks in webpack stats object.
  [#110](https://github.com/FormidableLabs/inspectpack/issues/110)

## 4.2.0

* Add `commonRoot` to `versions` metadata to indicate what installed paths are relative to.
* BUG: Detect hidden application roots for things like `yarn` workspaces that are completely flattened.
  [#103](https://github.com/FormidableLabs/inspectpack/issues/103)

## 4.1.2

* BUG: Use `name` field to better process `identifier` to remove things like
  `/PATH/TO/node_modules/font-awesome/font-awesome.css 0"`. May result in some
  `baseName`s being identical despite different `identifier`s because of
  loaders and generated code.

## 4.1.1

* BUG: A loader in the `identifier` field would incorrectly have all modules inferred "as a `node_modules` file", even if not. Implements a naive loader stripping heuristic to correctly assess if `node_modules` or real application source.
* Optimizes internal calls to `_isNodeModules()` from 2 to 1 for better performance.

## 4.1.0

* Add `emitHandler` option to `DuplicatesPlugin` to allow customized output.

## 4.0.1

* BUG: CLI execution fails from command line. (Missing shebang.)
  [#95](https://github.com/FormidableLabs/inspectpack/issues/95)

## 4.0.0

### Breaking changes

* `--action=versions`:
    * _Reports_: The `tsv` and `text` reports have now changed to reflect
      dependencies hierarchies as _installed_ (e.g., `scoped@1.2.3 ->
      flattened-foo@1.1.1 -> @scope/foo@1.1.1`) to a semver range meaning
      something like as _depended_ (e.g., `scoped@1.2.3 -> flattened-foo@^1.1.0
      -> @scope/foo@^1.1.1`). We expect that this change will provide much more
      useful information as to how and why your dependency graph impacts what is
      installed on disk in `node_modules` and ultimately what ends up in your
      webpack bundle.
    * _Metadata_: The following `meta` fields have been renamed to be easier
      to understand.
        * `skewedPackages` → `packages`: Number of packages with skews.
        * `skewedVersions` → `resolved`: Number of unique resolved versions.
        * `installedPackages` → `installed`: Number of on-disk installs.
        * `dependedPackages` → `depended`: Number of dependency paths.

### Features

* Add `range` information to all dependency items returned internally for
  dependencies utilities and ultimately all the way to `versions` data.
* Add `installed` aggregate statistic to `versions` metadata.
* Add `DuplicatesPlugin` webpack plugin.

### Fixes

* BUG: Per-asset `meta` stats were never set (all `0`) before in data.
* BUG: Multiple package roots incorrectly collapse / don't prefix.
  [#90](https://github.com/FormidableLabs/inspectpack/issues/90)

### Miscellaneous

* Updated README.md with note that `--action=versions` is not filtered to only
  packages that would have files show up in the `--action=duplicates` report.
* Update `--action=versions` logic to explicitly use `semver-compare` for sort
  order.

## 3.0.0

### Breaking changes

* Complete rewrite in TypeScript.
* Limit `package.json:engine` to `>=6.0.0` (aka, the current supported Nodes).
* Use webpack stats object instead of real bundle for data input.
* The structure and substantive content of all `json` data structures has
  changed, as well as the corollary `text` and `tsv` output formats.
    * `sizes`
        * Remove `bundle` field and all `min` + `min+gz` size fields.
        * Code `type` field has been removed.
    * `duplicates`: A complete revision of the JSON format and accompanying
      other format outputs.
    * `versions`: A complete rewrite of output formats **and** what is actually
      reported on. Now, only reports versions information if there are 2+ files
      of the same `baseName` (aka, the `foo.js` part of `lodash@1/foo.js`) with
      the reasoning that version skews that _don't_ result in duplicated files
      aren't technically a "problem".

### Features

* Support for `--action={sizes,duplicates,versions}`
* Format options `--format={json,text,tsv}`
* Colorized output for `--format=text`
* Maintain support (with tests) for webpack versions 1-4.

### Miscellaneous

* Add AppVeyor Windows CI.

## 2.2.4

* Add missing `babel-traverse` dependency. (*[@deadcoder0904][]*)
  [#55](https://github.com/FormidableLabs/inspectpack/issues/55)
* Separate `npm run benchmark` from CI as it's slow and brittle.

## 2.2.3

* Bad version. (Not published).

## 2.2.2

* Handle bundle module form of `Array().concat()`. (*[@ryan-codingintrigue][]*)
  [#53](https://github.com/FormidableLabs/inspectpack/issues/53)

## 2.2.1

* Handle weird `{ type: "Buffer", data: [INTEGERS] }` plain JavaScript object.
  [webpack-dashboard#193](https://github.com/FormidableLabs/webpack-dashboard/issues/193)

## 2.2.0

* Make `better-sqlite3` and `optionalDependency`. Switch to noop cache if not present.
  [#49](https://github.com/FormidableLabs/inspectpack/issues/49)
* Add `Cache.wrapAction` helper for common use case of "try cache get, do action, set cache".
* Change cross-process communication to just serialize/deserialize the applicable cache instance.
* Add `cache` option for `InspectpackDaemon.create`.
* Add error logging for worker errors.

## 2.1.0

* Better parsing of bundle AST. (*[@tptee][]*)
* Handle empty manifest. (*[@tptee][]*)
* Handle `ModuleConcatenationPlugin` code sections.

## 2.0.0

* Use `sqlite` to back the daemon cache
* Parallelize workers
* *Breaking*: rename factory methods from `init` to `create`.

## 1.3.2

* Move `formidable-playbook` to `devDependencies`.

## 1.3.1

* Version bump to essentially `v1.2.3` as the complete most recent version.
* Also add `.npmignore` to hone down files published.

## 1.3.0

* Switch to `uglify-es` for minification estimates.
* **Note**: Missing `v1.2.3` changes.

## 1.2.3

* Fix over-truncating `sourceMappingUrl` comment removal.
* **Note**: Includes `v1.3.0` changes.

## 1.2.2

* Improve module ID comment inference logic.
* Add `--allow-empty` command flag and internal option for malformed bundles.
* Capture bundle validation errors in callback rather than throwing
  synchronously.

## 1.2.1

* Fix size inspection of bundles created with `devtool: eval`. (*[@kkerr1][]*)

## 0.6.1

* Fix usage of `lodash/fp`.

## 0.6.0

* Add `--action=versions` report. (*[@rgerstenberger][]*)

## 0.5.0

* Add `--action=sizes` report.
* Add `--format=tsv` output for all reports.

## 0.4.1

* Add ES6 reexport detection to `--action=parse` report. (*[@divmain][]*)
  [#14](https://github.com/FormidableLabs/inspectpack/issues/14)

## 0.4.0

* Add `--action=parse` report. (*[@divmain][]*)
  [#7](https://github.com/FormidableLabs/inspectpack/issues/7)

## 0.3.0

* Add `--action=files` report.
  [#4](https://github.com/FormidableLabs/inspectpack/issues/4)

## 0.2.0

* Add `--action=pattern` report.
  [#4](https://github.com/FormidableLabs/inspectpack/issues/4)

## 0.1.1

* Add `--gzip` flag and output to `--action=duplicates` report.
  [#3](https://github.com/FormidableLabs/inspectpack/issues/3)

## 0.1.0

* Add `--action=duplicates` report.

[@alexander-schranz]: https://github.com/alexander-schranz
[@deadcoder0904]: https://github.com/deadcoder0904
[@divmain]: https://github.com/divmain
[@jensbodal]: https://github.com/jensbodal
[@kkerr1]: https://github.com/kkerr1
[@rgerstenberger]: https://github.com/rgerstenberger
[@ryan-codingintrigue]: https://github.com/ryan-codingintrigue
[@ryan-roemer]: https://github.com/ryan-roemer
[@tido64]: https://github.com/tido64
[@tptee]: https://github.com/tptee
