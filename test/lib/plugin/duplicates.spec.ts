import { readFile } from "fs";
import { join } from "path";

import { expect } from "chai";
import * as mock from "mock-fs";
import * as pify from "pify";
import * as sinon from "sinon";

import * as actionsDups from "../../../src/lib/actions/duplicates";
import * as actionsVersions from "../../../src/lib/actions/versions";

import {
   _getDuplicatesVersionsData,
   DuplicatesPlugin
} from "../../../src/plugin/duplicates";
import { ICompilation } from "../../../src/plugin/common";

import * as chalk from "chalk";
import { IWebpackStats } from "../../../src/lib/interfaces/webpack-stats";
import { toPosixPath } from "../../../src/lib/util/files";
import { IFixtures, loadFixtures, VERSIONS } from "../../utils";
import { EMPTY_VERSIONS_DATA, EMPTY_VERSIONS_META } from "../actions/versions.spec";

const readFileP = pify(readFile);

const MULTI_SCENARIO = "multiple-resolved-no-duplicates";

const EMPTY_DUPLICATES_DATA = {
  assets: {},
  meta: {
    extraFiles: {
      num: 0,
    },
    extraSources: {
      bytes: 0,
      num: 0,
    },
  },
};

const EMPTY_VERSIONS_DATA_ASSET = {
  meta: EMPTY_VERSIONS_META,
  packages: {},
};

describe("plugin/duplicates", () => {
  let sandbox: sinon.SinonSandbox;
  let fixtures: IFixtures;
  let multiDataDuplicates: actionsDups.IDuplicatesData[];
  let multiDataVersions: actionsVersions.IVersionsData[];

  const getDuplicatesData = (name: string): Promise<actionsDups.IDuplicatesData> =>
    Promise.resolve()
    .then(() => actionsDups.create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then((instance) => instance.getData() as Promise<actionsDups.IDuplicatesData>);

  const getVersionsData = (name: string): Promise<actionsVersions.IVersionsData> =>
    Promise.resolve()
    .then(() => actionsVersions.create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then((instance) => instance.getData() as Promise<actionsVersions.IVersionsData>);

  before(() => loadFixtures().then((f) => { fixtures = f; }));

  before(() => Promise.all(
    VERSIONS.map((vers) => getDuplicatesData(join(MULTI_SCENARIO, `dist-development-${vers}`))),
  )
    .then((d) => { multiDataDuplicates = d as actionsDups.IDuplicatesData[]; }));

  before(() => Promise.all(
    VERSIONS.map((vers) => getVersionsData(join(MULTI_SCENARIO, `dist-development-${vers}`))),
  )
    .then((d) => { multiDataVersions = d as actionsVersions.IVersionsData[]; }));

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    mock.restore();
  });

  describe("_getDuplicatesVersionsData", () => {
    let warningSpy: sinon.SinonSpy;

    beforeEach(() => {
      warningSpy = sandbox.spy();
    });

    it("handles base cases", () => {
      const actual = _getDuplicatesVersionsData(
        EMPTY_DUPLICATES_DATA, EMPTY_VERSIONS_DATA, warningSpy,
      );
      expect(actual).to.eql(EMPTY_VERSIONS_DATA);
      expect(warningSpy).to.not.be.called; // tslint:disable-line no-unused-expression
    });

    describe(`handles ${MULTI_SCENARIO}`, () => {
      VERSIONS.forEach((vers) => {
        it(`v${vers}`, () => {
          const origVersionsData = multiDataVersions[parseInt(vers, 10) - 1];
          const noDupsVersions = _getDuplicatesVersionsData(
            multiDataDuplicates[parseInt(vers, 10) - 1],
            origVersionsData,
            warningSpy,
          );

          // Should remove all of the no-duplicates bundle.
          expect(noDupsVersions)
            .to.have.nested.property("assets.bundle-no-duplicates\\.js")
            .that.eql(EMPTY_VERSIONS_DATA_ASSET);

          // Take the original versions bundle and "subtract" the "no-duplicates" part.
          const expectedBundle = JSON.parse(JSON.stringify(origVersionsData.assets["bundle.js"]));
          delete expectedBundle.packages["no-duplicates"];

          const expectedNoDuplicatesAsset = origVersionsData.assets["bundle-no-duplicates.js"].meta;
          expectedBundle.meta.depended.num -= expectedNoDuplicatesAsset.depended.num;
          expectedBundle.meta.files.num -= expectedNoDuplicatesAsset.files.num;
          expectedBundle.meta.installed.num -= expectedNoDuplicatesAsset.installed.num;
          expectedBundle.meta.packages.num -= expectedNoDuplicatesAsset.packages.num;
          expectedBundle.meta.resolved.num -= expectedNoDuplicatesAsset.resolved.num;

          // Should adjust for the index bundle (just foo).
          expect(noDupsVersions)
            .to.have.nested.property("assets.bundle\\.js")
            .that.eql(expectedBundle);

          // Expect no warnings.
          expect(warningSpy).to.not.be.called; // tslint:disable-line no-unused-expression
        });
      });
    });
  });

  describe("DuplicatesPlugin", () => {
    beforeEach(() => {
      sandbox.stub(console, "log");
    });

    // Manually apply the analysis function with mocks.
    describe(`analyzes ${MULTI_SCENARIO}`, () => {
      VERSIONS.forEach((vers) => {
        // Mock compilation:
        let compilation: ICompilation;
        let toJson: () => IWebpackStats;

        // Report outputs
        let defaultReport: string;
        let verboseReport: string;

        before(async () => {
          // Get actual file sizes as these differ on windows and linux on GH actions.
          const FIXTURE_DIR = join(__dirname, "../../fixtures/multiple-resolved-no-duplicates");
          const getSize = (file: string) => readFileP(join(FIXTURE_DIR, file)).then((buf) => buf.length);
          const ROOT_SIZE = await getSize("node_modules/foo/index.js");
          const NESTED_SIZE = await getSize("node_modules/uses-foo/node_modules/foo/index.js");
          const COMBINED_SIZE = ROOT_SIZE + NESTED_SIZE;

          // tslint:disable max-line-length
          defaultReport = `Duplicate Sources / Packages - Duplicates found! ⚠️

* Duplicates: Found 1 similar files across 2 code sources (both identical + similar)
  accounting for ${COMBINED_SIZE} bundled bytes.
* Packages: Found 1 packages with 1 resolved, 2 installed, and 2 depended versions.

## bundle.js
foo (Found 1 resolved, 2 installed, 2 depended. Latest 1.1.1.)
  1.1.1 ~/foo
    multiple-resolved-no-duplicates@1.2.3 -> foo@^1.0.0
  1.1.1 ~/uses-foo/~/foo
    multiple-resolved-no-duplicates@1.2.3 -> uses-foo@^1.0.9 -> foo@^1.0.1

* Understanding the report: Need help with the details? See:
  https://github.com/FormidableLabs/inspectpack/#diagnosing-duplicates
* Fixing bundle duplicates: An introductory guide:
  https://github.com/FormidableLabs/inspectpack/#fixing-bundle-duplicates
`;

          verboseReport = `Duplicate Sources / Packages - Duplicates found! ⚠️

* Duplicates: Found 1 similar files across 2 code sources (both identical + similar)
  accounting for ${COMBINED_SIZE} bundled bytes.
* Packages: Found 1 packages with 1 resolved, 2 installed, and 2 depended versions.

## bundle.js
foo (Found 1 resolved, 2 installed, 2 depended. Latest 1.1.1.)
  1.1.1
    ~/foo
      * Dependency graph
        multiple-resolved-no-duplicates@1.2.3 -> foo@^1.0.0
      * Duplicated files in bundle.js
        foo/index.js (I, ${ROOT_SIZE})

    ~/uses-foo/~/foo
      * Dependency graph
        multiple-resolved-no-duplicates@1.2.3 -> uses-foo@^1.0.9 -> foo@^1.0.1
      * Duplicated files in bundle.js
        foo/index.js (I, ${NESTED_SIZE})

* Understanding the report: Need help with the details? See:
  https://github.com/FormidableLabs/inspectpack/#diagnosing-duplicates
* Fixing bundle duplicates: An introductory guide:
  https://github.com/FormidableLabs/inspectpack/#fixing-bundle-duplicates
`;
          // tslint:enable max-line-length
        });

        beforeEach(() => {
          const stats = fixtures[toPosixPath(join(MULTI_SCENARIO, `dist-development-${vers}`))];
          toJson = sinon.stub().returns(stats);
          compilation = {
            errors: [],
            getStats: () => ({ toJson }),
            warnings: [],
          };
        });

        describe(`v${vers}`, () => {
          let origChalkLevel: chalk.Level;

          beforeEach(() => {
            // Stash and disable chalk for tests.
            origChalkLevel = chalk.level;
            (chalk as any).level = 0;
          });

          afterEach(() => {
            (chalk as any).level = origChalkLevel;
          });

          it(`produces a default report`, () => {
            const plugin = new DuplicatesPlugin({});

            return plugin.analyze(compilation).then(() => {
              expect(compilation.errors).to.eql([]);
              expect(compilation.warnings)
                .to.have.lengthOf(1).and
                .to.have.property("0").that
                  .is.an("Error").and
                  .has.property("message", defaultReport);
            });
          });

          it(`produces a verbose report`, () => {
            const plugin = new DuplicatesPlugin({
              verbose: true,
            });

            return plugin.analyze(compilation).then(() => {
              expect(compilation.errors).to.eql([]);
              expect(compilation.warnings)
                .to.have.lengthOf(1).and
                .to.have.property("0").that
                  .is.an("Error").and
                  .has.property("message", verboseReport);
            });
          });

          it(`emits errors to default report`, () => {
            const plugin = new DuplicatesPlugin({
              emitErrors: true,
            });

            return plugin.analyze(compilation).then(() => {
              expect(compilation.warnings).to.eql([]);
              expect(compilation.errors)
                .to.have.lengthOf(1).and
                .to.have.property("0").that
                  .is.an("Error").and
                  .has.property("message", defaultReport);
            });
          });

          it(`emits errors to verbose report`, () => {
            const plugin = new DuplicatesPlugin({
              emitErrors: true,
              verbose: true,
            });

            return plugin.analyze(compilation).then(() => {
              expect(compilation.warnings).to.eql([]);
              expect(compilation.errors)
                .to.have.lengthOf(1).and
                .to.have.property("0").that
                  .is.an("Error").and
                  .has.property("message", verboseReport);
            });
          });

          it(`emits to handler to default report`, () => {
            const emitHandler = sandbox.spy();
            const plugin = new DuplicatesPlugin({
              emitHandler,
            });

            return plugin.analyze(compilation).then(() => {
              expect(compilation.warnings).to.eql([]);
              expect(compilation.errors).to.eql([]);
              expect(emitHandler).to.have.callCount(1);

              // First call, first argument is the report
              const actualReport = emitHandler.args[0][0];
              expect(actualReport).to.eql(defaultReport);
            });
          });

          it(`emits to handler to verbose report`, () => {
            const emitHandler = sandbox.spy();
            const plugin = new DuplicatesPlugin({
              emitHandler,
              verbose: true,
            });

            return plugin.analyze(compilation).then(() => {
              expect(compilation.warnings).to.eql([]);
              expect(compilation.errors).to.eql([]);
              expect(emitHandler).to.have.callCount(1);

              // First call, first argument is the report
              const actualReport = emitHandler.args[0][0];
              expect(actualReport).to.eql(verboseReport);
            });
          });

          it(`ignores specified packages with strings`, () => {
            const plugin = new DuplicatesPlugin({
              emitErrors: true,
              ignoredPackages: ["foo"],
            });

            return plugin.analyze(compilation).then(() => {
              expect(compilation.warnings).to.eql([]);
              expect(compilation.errors).to.eql([]);
            });
          });

          it(`ignores specified packages with regexes`, () => {
            const plugin = new DuplicatesPlugin({
              emitErrors: true,
              ignoredPackages: [/^f[o]{2}\//],
            });

            return plugin.analyze(compilation).then(() => {
              expect(compilation.warnings).to.eql([]);
              expect(compilation.errors).to.eql([]);
            });
          });
        });
      });
    });
  });
});
