import { basename, join, relative, sep } from "path";

import { readDir, readJson, toPosixPath } from "../src/lib/util/files";

/*tslint:disable no-var-requires*/
const versions = require("./fixtures/config/versions.json");
const scenarios = require("./fixtures/config/scenarios.json");
/*tslint:enable no-var-requires*/

export const FIXTURES = scenarios.map((s) => s.WEBPACK_CWD.replace("../../test/fixtures/", ""));

// We skip webpack@1 tests that involve source code with `import`s and loaders
// because webpack@2+ just "handles" it, so we'd need a loader in webpack@1
// which would then change the source size and cause the data to mismatch.
//
// Rather than deal with all these complexities, we just skip the subset of
// tests for webpack@1 that involve `import` or loaders.
export const FIXTURES_WEBPACK1_BLACKLIST = [
  "duplicates-esm",
  "loaders",
  "multiple-chunks",
  "tree-shaking",
];

export const VERSIONS = versions.map((v) => v.WEBPACK_VERSION);

const FIXTURES_DIRS = FIXTURES
  .map((f) => VERSIONS.reduce((m, v) => m.concat([
    join("../../test/fixtures", f, `dist-development-${v}`),
    join("../../test/fixtures", f, `dist-production-${v}`),
  ]), []))
  .reduce((m, a) => m.concat(a));

const FIXTURES_DIR_PATHS = FIXTURES.map((f) => join(__dirname, "fixtures", f));
const FIXTURES_STATS = FIXTURES_DIRS.map((f) => join(__dirname, "fixtures", f, "stats.json"));

// Extra patches for webpack-config-driven stuff that doesn't fit within
// node_modules-based traversals.
const FIXTURES_EXTRA_DIRS = {
  "multiple-roots": [
    "packages/package1",
    "packages/package2",
  ],
};

let _fixtures;
export const loadFixtures = () => {
  _fixtures = _fixtures || Promise.all(FIXTURES_STATS.map((f) => readJson(f)))
    .then((objs) => objs.reduce((memo, f, i) => ({
      ...memo,
      [toPosixPath(FIXTURES_DIRS[i]).replace("../../test/fixtures/", "")]: f,
    }), {}));

  return _fixtures;
};

const _traverseFixtureDir = (dirPath) => Promise.resolve()
  .then(() => readDir(dirPath))
  .then((names) => {
    const havePkg = names.indexOf("package.json") > -1;
    const haveNm = names.indexOf("node_modules") > -1;
    const baseName = basename(dirPath);
    const extraDirs = FIXTURES_EXTRA_DIRS[baseName] || [];

    const pkgProm = !havePkg ? [] : Promise.resolve()
      .then(() => readJson(join(dirPath, "package.json")))
      .then((data) => ({
        "package.json": JSON.stringify({
          dependencies: data.dependencies,
          name: data.name,
          version: data.version,
        }),
      }));

    const nmProm = !haveNm ? [] : Promise.resolve()
      // Get next level directories.
      .then(() => readDir(join(dirPath, "node_modules")))
      // Add extra lookups for scoped package directory parents.
      .then((pkgDirs) => Promise
        .all(
          pkgDirs
            .filter((n) => n.startsWith("@"))
            .map((n) => readDir(join(dirPath, "node_modules", n))
              .then((dirs) => dirs.map((d) => join(n, d))),
            ),
        ).then((extraScoped) => [].concat(
          // Limit our existing package directories to non-scoped.
          pkgDirs.filter((n) => !n.startsWith("@")),
          // Flatten our any additional scoped dirs.
          extraScoped.reduce((m, a) => m.concat(a), []),
        )),
      )
      // Recursively traverse those.
      .then((pkgDirs) => Promise
        .all(pkgDirs.map((pkgDir) => _traverseFixtureDir(join(dirPath, "node_modules", pkgDir))))
        .then((pkgInfo) => ({
          node_modules: pkgDirs
            .reduce((memo, pkgName, i) => {
              // Unpack scoped packages to nested object.
              const parts = pkgName.split(sep);
              if (parts.length === 1) {
                memo[pkgName] = pkgInfo[i];
              } else if (parts.length === 2) {
                memo[parts[0]] = memo[parts[0]] || {};
                memo[parts[0]][parts[1]] = pkgInfo[i];
              } else {
                throw new Error(`Invalid package name: ${pkgName}`);
              }

              return memo;
            }, {}),
        })),
      );

    const extraProm = Promise
        .all(extraDirs.map((extraDir) => _traverseFixtureDir(join(dirPath, extraDir))))
        .then((pkgInfo) => extraDirs.reduce((memo, extraDir) => {
          const parts = extraDir.split("/");
          parts.reduce((partsMemo, extraPart, i) => {
            // Ensure path.
            partsMemo[extraPart] = partsMemo[extraPart] || {};
            // Add object to last part.
            if (i === parts.length - 1) {
              partsMemo[extraPart] = pkgInfo[i];
            }
            // Memo.
            return partsMemo[extraPart];
          }, memo);

          return memo;
        }, {}));

    return Promise.all([].concat(pkgProm, nmProm, extraProm));
  })
  .then((results) => Object.assign.apply(null, results)); // merge together.

const _fixtureDirs = {};
let _fixtureDirsProm;
export const loadFixtureDirs = () => {
  _fixtureDirsProm = _fixtureDirsProm || Promise
    // Traverse all fixture dirs.
    .all(FIXTURES_DIR_PATHS.map((f) => _traverseFixtureDir(f)))
    // Attach to memoized cache object.
    .then((files) => files.reduce((memo, obj, i) => {
      const key = toPosixPath(relative(process.cwd(), FIXTURES_DIR_PATHS[i]));
      memo[key] = obj;
      return memo;
    }, _fixtureDirs));

  return _fixtureDirsProm;
};

// Reusable re's that have same capture groups.
export const TEXT_PATH_RE =
  /^(\* |\s+\([0-9]+\)\s+?)(.*)(\/|[\\]{1,2})test(\/|[\\]{1,2})fixtures(\/|[\\]{1,2})([^\t\n]*\.js)(.*$)/gm;
export const TSV_PATH_RE =
  /^([^\t]*\.js\t)(.*?)(\/|[\\]{1,2})test(\/|[\\]{1,2})fixtures(\/|[\\]{1,2})([^\t\n]*\.js)(.*$)/gm;
export const JSON_PATH_RE =
  /(\": \")([^\"]*)(\/|[\\]{1,2})test(\/|[\\]{1,2})fixtures(\/|[\\]{1,2})([^\"]*\.js)(\")/gm;

const LIST_CHAR_IDX = 1; // Where the list item character is (need to preserve).
const REL_PATH_IDX = 6; // Where the relative path we want is.
const REMAINDER_IDX = 7; // Everything after.

// Normalize output strings across Windows / Mac / Linux
// - shorten, make relative, and posixify test paths
// - replace numbers of byte sizes with `"NUM"` since Windows has different
//   byte counts.
export const normalizeOutput = (re: RegExp, str: string) => str
  // Normalize any string paths.
  .replace(re, function() { // tslint:disable-line only-arrow-functions
    return [
      arguments[LIST_CHAR_IDX],
      // Posixify, then hack in extra double slash removal (from escaped JSON conversions).
      toPosixPath(arguments[REL_PATH_IDX]).replace(/\/\//g, "/"),
      arguments[REMAINDER_IDX],
    ].join("");
  })
  // Replace all numbers of *sizes* that might be different on different platforms.
  .replace(/\t[0-9]+/g, "\tNUM") // TSV
  .replace(/full\": [0-9]+/g, "full\": \"NUM\"") // JSON
  .replace(/bytes\": [0-9]+/g, "bytes\": \"NUM\"") // JSON
  .replace(/Size: [0-9]+/g, "Size: NUM") // TEXT
  .replace(/Bytes: [0-9]+/g, "Bytes: NUM") // TEXT
  .replace(/Bytes [0-9]+/g, "Bytes NUM") // TEXT
  .replace(/Extra Bytes \(non-unique\):     [0-9]+/g, "Extra Bytes (non-unique):     NUM") // TEXT
  .replace(/ \([0-9]+\) /g, " (NUM) ") // TEXT
  ;
