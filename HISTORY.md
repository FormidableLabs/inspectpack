History
=======

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

[@divmain]: https://github.com/divmain
[@kkerr1]: https://github.com/kkerr1
[@rgerstenberger]: https://github.com/rgerstenberger
[@ryan-codingintrigue]: https://github.com/ryan-codingintrigue
[@ryan-roemer]: https://github.com/ryan-roemer
[@tptee]: https://github.com/kkerr1
