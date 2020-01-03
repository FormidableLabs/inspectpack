import { basename, join, relative, sep } from "path";

import { IModule } from "../src/lib/interfaces/modules";
import { IWebpackStats } from "../src/lib/interfaces/webpack-stats";
import { readDir, readJson, toPosixPath } from "../src/lib/util/files";

/*tslint:disable no-var-requires*/
interface IVersion { WEBPACK_VERSION: string; }
const versions: IVersion[] = require("./fixtures/config/versions.json");
interface IScenario { WEBPACK_CWD: string; }
const scenarios: IScenario[] = require("./fixtures/config/scenarios.json");
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

// Skip testing webpack4 vs. webpack1-3 because tree shaking appears to work
// in this scenario now-ish...
//
// See: https://github.com/FormidableLabs/inspectpack/issues/77
export const FIXTURES_WEBPACK4_BLACKLIST = [
  "tree-shaking",
];

export const VERSIONS = versions.map((v) => v.WEBPACK_VERSION);

const FIXTURES_DIRS = FIXTURES
  .map((f) => VERSIONS.reduce((m: string[], v) => m.concat([
    join("../../test/fixtures", f, `dist-development-${v}`),
    join("../../test/fixtures", f, `dist-production-${v}`),
  ]), []))
  .reduce((m, a) => m.concat(a));

const FIXTURES_DIR_PATHS = FIXTURES.map((f) => join(__dirname, "fixtures", f));
const FIXTURES_STATS = FIXTURES_DIRS.map((f) => join(__dirname, "fixtures", f, "stats.json"));

// Extra patches for webpack-config-driven stuff that doesn't fit within
// node_modules-based traversals.
const FIXTURES_EXTRA_DIRS: { [scenario: string]: string[] } = {
  "hidden-app-roots": [
    "packages/hidden-app",
  ],
  "multiple-roots": [
    "packages/package1",
    "packages/package2",
  ],
};

export interface IFixtures { [name: string]: IWebpackStats; }
let _fixtures: Promise<IFixtures>;
export const loadFixtures = (): Promise<IFixtures> => {
  _fixtures = _fixtures || Promise.all(FIXTURES_STATS.map((f) => readJson(f)))
    .then((objs) => objs.reduce((memo: IFixtures, f, i) => ({
      ...memo,
      [toPosixPath(FIXTURES_DIRS[i]).replace("../../test/fixtures/", "")]: f,
    }), {}));

  return _fixtures;
};

// TODO(ts): Get better type here.
const _traverseFixtureDir = (dirPath: string): Promise<any> => Promise.resolve()
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
        ).then((extraScoped) => ([] as string[]).concat(
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
            }, {} as any), // TODO(ts): Better typing
        })),
      );

    const extraProm = Promise
        .all(extraDirs.map((extraDir) => _traverseFixtureDir(join(dirPath, extraDir))))
        .then((pkgInfos) => extraDirs.reduce((memo, extraDir, i) => {
          const pkgInfo = pkgInfos[i];
          const parts = extraDir.split("/");
          parts.reduce((partsMemo, extraPart, j) => {
            // Ensure path.
            partsMemo[extraPart] = partsMemo[extraPart] || {};

            // Add object to last part.
            if (j === parts.length - 1) {
              partsMemo[extraPart] = pkgInfo;
            }

            // Memo.
            return partsMemo[extraPart];
          }, memo);

          return memo;
        }, {} as any)); // TODO(ts): Better typing

    // TODO(ts): Better typing
    return Promise.all(([] as Array<Promise<any>>).concat(pkgProm, nmProm, extraProm));
  })
  // merge together.
  .then((results) => results.reduce((memo, result) => ({ ...memo, ...result }), {}));

const _fixtureDirs = {};
let _fixtureDirsProm: Promise<object>; // TODO(ts): Better typing
export const loadFixtureDirs = (): Promise<object> => {
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

// General action patching
export const patchAllMods = (name: string) => (mod: IModule) => {
  // Looks like tree-shaking **does** work in updated webpack4.
  // Manually adjust just `foo/green.js` which is DCE'd to normalize dev vs prod
  //
  // **Side Effect**: Relies on populated `_assets` from above.
  //
  // See: https://github.com/FormidableLabs/inspectpack/issues/77
  if (name === join("tree-shaking", "dist-development-4") &&
    mod.baseName === "foo/green.js") {
    mod.chunks = [];
  }

  return mod;
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
