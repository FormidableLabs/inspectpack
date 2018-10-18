import chalk from "chalk";
import { actions } from "../lib";
import { IDuplicatesData, IDuplicatesFiles } from "../lib/actions/duplicates";
import { IVersionsData } from "../lib/actions/versions";
import { IWebpackStats } from "../lib/interfaces/webpack-stats";
import { INpmPackageBase } from "../lib/util/dependencies";
import { numF, sort } from "../lib/util/strings";

const { log } = console;

const identical = (val: string) => chalk`{bold.magenta ${val}}`;
const similar = (val: string) => chalk`{bold.blue ${val}}`;
const warning = (val: string) => chalk`{bold.yellow ${val}}`;
const error = (val: string) => chalk`{bold.red ${val}}`;

// Simple interfaces for webpack work.
// See, e.g. https://github.com/TypeStrong/ts-loader/blob/master/src/interfaces.ts
interface ICompiler {
  hooks: any;
  plugin: (name: string, callback: () => void) => void;
}

interface ICompilation {
  errors: Error[];
  warnings: Error[];
  getStats: () => {
    toJson: () => IWebpackStats;
  };
}

interface IDuplicatesByFileModule {
  baseName: string;
  bytes: number;
  isIdentical: boolean;
}

interface IDuplicatesByFile {
  [fileName: string]: IDuplicatesByFileModule;
}

// `~/different-foo/~/foo`
const shortPath = (filePath: string) => filePath.replace(/node_modules/g, "~");

// `duplicates-cjs@1.2.3 -> different-foo@1.1.1 -> foo@3.3.3`
const pkgNamePath = (pkgParts: INpmPackageBase[]) => pkgParts.reduce(
  (m, part) => `${m}${m ? " -> " : ""}${part.name}@${part.range}`,
  "",
);

// Organize duplicates by package name.
const getDuplicatesByFile = (files: IDuplicatesFiles) => {
  const dupsByFile: IDuplicatesByFile = {};

  Object.keys(files).forEach((fileName) => {
    files[fileName].sources.forEach((source) => {
      source.modules.forEach((mod) => {
        dupsByFile[mod.fileName] = {
          baseName: mod.baseName || mod.fileName,
          bytes: mod.size.full,
          isIdentical: source.meta.extraSources.num > 1,
        };
      });
    });
  });

  return dupsByFile;
};

interface IDuplicatesPluginConstructor {
  verbose?: boolean;
  emitErrors?: boolean;
}

export class DuplicatesPlugin {
  private opts: IDuplicatesPluginConstructor;

  constructor(opts: IDuplicatesPluginConstructor | null) {
    opts = opts || {};

    this.opts = {};
    this.opts.verbose = opts.verbose === true; // default `false`
    this.opts.emitErrors = opts.emitErrors === true; // default `false`
  }

  public apply(compiler: ICompiler) {
    if (compiler.hooks) {
      // Webpack4 integration
      compiler.hooks.emit.tapPromise("inspectpack-duplicates-plugin", this.analyze.bind(this));
    } else {
      // Webpack1-3 integration
      compiler.plugin("emit", this.analyze.bind(this));
    }
  }

  public analyze(compilation: ICompilation, callback: () => void) {
    const { errors, warnings } = compilation;
    const stats = compilation.getStats().toJson();

    const { emitErrors, verbose } = this.opts;

    // Stash messages for output to console (success) or compilation warnings
    // or errors arrays on duplicates found.
    const msgs: string[] = [];
    const addMsg = (msg: string) => msgs.push(msg);

    return Promise.all([
      actions("duplicates", { stats }).then((a) => a.getData() as Promise<IDuplicatesData>),
      actions("versions", { stats }).then((a) => a.getData() as Promise<IVersionsData>),
    ])
      .then((datas) => {
        const [dupData, pkgData] = datas;
        const header = chalk`{bold.underline Duplicate Sources / Packages}`;

        // No duplicates.
        if (dupData.meta.extraFiles.num === 0) {
          log(chalk`\n${header} - {green No duplicates found. 🚀}\n`);
          return;
        }

        // Choose output format.
        const fmt = emitErrors ? error : warning;

        // Have duplicates. Report summary.
        // tslint:disable max-line-length
        addMsg(chalk`${header} - ${fmt("Duplicates found! ⚠️")}

* {yellow.bold.underline Duplicates}: Found a total of ${numF(dupData.meta.extraFiles.num)} ${similar("similar")} files across ${numF(dupData.meta.extraSources.num)} code sources (both ${identical("identical")} + similiar) accounting for ${numF(dupData.meta.extraSources.bytes)} bundled bytes.
* {yellow.bold.underline Packages}: Found a total of ${numF(pkgData.meta.skewedPackages.num)} packages with ${numF(pkgData.meta.skewedVersions.num)} {underline resolved}, ${numF(pkgData.meta.installedPackages.num)} {underline installed}, and ${numF(pkgData.meta.dependedPackages.num)} {underline depended} versions.
`);
        // tslint:enable max-line-length

        Object.keys(pkgData.assets).forEach((dupAssetName) => {
          const pkgAsset = pkgData.assets[dupAssetName];
          addMsg(chalk`{gray ## ${dupAssetName}}`);

          let dupsByFile: IDuplicatesByFile = {};
          if (dupData.assets[dupAssetName] &&
            dupData.assets[dupAssetName].files) {
            dupsByFile = getDuplicatesByFile(dupData.assets[dupAssetName].files);
          }

          const { packages } = pkgAsset;
          Object.keys(packages).forEach((pkgName) => {
            // Calculate stats / info during maps.
            let latestVersion;
            let numResolved = Object.keys(packages[pkgName]).length;
            let numInstalls = 0;

            const versions = Object.keys(packages[pkgName])
              .map((version) => {
                // Capture
                latestVersion = version;
                numInstalls += Object.keys(packages[pkgName][version]).length;

                let installs = Object.keys(packages[pkgName][version]).map((installed) => {
                  const skews = packages[pkgName][version][installed].skews
                    .map((pkgParts) => pkgParts.map((part, i) => ({
                      ...part,
                      name: chalk[i < pkgParts.length - 1 ? "gray" : "cyan"](part.name),
                    })))
                    .map(pkgNamePath)
                    .sort(sort);

                  if (!verbose) {
                    return chalk`  {green ${version}} {gray ${shortPath(installed)}}
    ${skews.join("\n    ")}`;
                  }

                  const duplicates = packages[pkgName][version][installed].modules
                    .map((mod) => dupsByFile[mod.fileName])
                    .filter(Boolean)
                    .map((mod) => {
                      const note = mod.isIdentical ? identical("I") : similar("S");
                      return chalk`{gray ${mod.baseName}} (${note}, ${numF(mod.bytes)})`;
                    });

                  return chalk`    {gray ${shortPath(installed)}}
      {white * Dependency graph}
        ${skews.join("\n        ")}
      {white * Duplicates}
        ${duplicates.join("\n        ")}
  `;
                });

                if (verbose) {
                  installs = [chalk`  {green ${version}}`].concat(installs);
                }

                return installs;
              })
              .reduce((m, a) => m.concat(a)); // flatten.

            addMsg(chalk`{cyan ${pkgName}} (Found ${numF(numResolved)} resolved, ${numF(numInstalls)} installed. Latest version {green ${latestVersion || "NONE"}}.)`);
            versions.forEach(addMsg);

            if (!verbose) {
              addMsg(""); // extra newline in terse mode.
            }
          });
        });
        // tslint:disable max-line-length
        addMsg(chalk`
* {yellow.bold.underline Understanding the report}: Need help with the details? See:
  https://github.com/FormidableLabs/inspectpack/blob/master/README.md#diagnosing-duplicates
* {yellow.bold.underline Fixing build duplicates}: An introductory guide:
  https://github.com/FormidableLabs/inspectpack/blob/naster/README.md#fixing-bundle-duplicates
`.trimLeft());
        // tslint:enable max-line-length

        // Drain messages into warnings or Errors.
        const output = emitErrors ? errors : warnings;
        output.push(new Error(msgs.join("\n")));
      })
      // Handle old plugin API callback.
      .then(() => {
        if (callback) { return void callback(); }
      })
      .catch((err) => {
        // Ignore error from old webpack.
        if (callback) { return void callback(); }
        throw err;
      });
  }
}
