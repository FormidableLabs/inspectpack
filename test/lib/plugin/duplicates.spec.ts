import { join } from "path";

import * as mock from "mock-fs";
import * as sinon from "sinon";

import * as actionsDups from "../../../src/lib/actions/duplicates";
import * as actionsVersions from "../../../src/lib/actions/versions";

import { _getDuplicatesVersionsData, DuplicatesPlugin } from "../../../src/plugin/duplicates";

import chalk from "chalk";
import { toPosixPath } from "../../../src/lib/util/files";
import { loadFixtures, VERSIONS } from "../../utils";
import { EMPTY_VERSIONS_DATA, EMPTY_VERSIONS_META } from "../actions/versions.spec";

const MULTI_SCENARIO = "multiple-resolved-no-duplicates";

const EMPTY_DUPLICATES_DATA = {
  assets: {},
  meta: {
    depended: {
      num: 0,
    },
    files: {
      num: 0,
    },
    installed: {
      num: 0,
    },
    packageRoots: [],
    packages: {
      num: 0,
    },
    resolved: {
      num: 0,
    },
  },
};

const EMPTY_VERSIONS_DATA_ASSET = {
  meta: EMPTY_VERSIONS_META,
  packages: {},
};

describe("plugin/duplicates", () => {
  let sandbox;
  let fixtures;
  let multiDataDuplicates;
  let multiDataVersions;

  const getDuplicatesData = (name) => Promise.resolve()
    .then(() => actionsDups.create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then((instance) => instance.getData());

  const getVersionsData = (name) => Promise.resolve()
    .then(() => actionsVersions.create({ stats: fixtures[toPosixPath(name)] }).validate())
    .then((instance) => instance.getData());

  before(() => loadFixtures().then((f) => { fixtures = f; }));

  before(() => Promise.all(
    VERSIONS.map((vers) => getDuplicatesData(join(MULTI_SCENARIO, `dist-development-${vers}`))),
  )
    .then((d) => { multiDataDuplicates = d; }));

  before(() => Promise.all(
    VERSIONS.map((vers) => getVersionsData(join(MULTI_SCENARIO, `dist-development-${vers}`))),
  )
    .then((d) => { multiDataVersions = d; }));

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
    mock.restore();
  });

  describe("_getDuplicatesVersionsData", () => {
    it("handles base cases", () => {
      expect(_getDuplicatesVersionsData(EMPTY_DUPLICATES_DATA, EMPTY_VERSIONS_DATA))
        .to.eql(EMPTY_VERSIONS_DATA);
    });

    describe(`handles ${MULTI_SCENARIO}`, () => {
      VERSIONS.forEach((vers) => {
        it(`v${vers}`, () => {
          const origVersionsData = multiDataVersions[vers - 1];
          const noDupsVersions = _getDuplicatesVersionsData(
            multiDataDuplicates[vers - 1],
            origVersionsData,
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
        });
      });
    });
  });

  describe("DuplicatesPlugin", () => {
    // Manually apply the analysis function with mocks.
    describe(`analyzes ${MULTI_SCENARIO}`, () => {
      VERSIONS.forEach((vers) => {
        // Mock compilation:
        let compilation: ICompilation;
        let toJson;

        // Report outputs
        // tslint:disable max-line-length
        const defaultReport = `Duplicate Sources / Packages - Duplicates found! ⚠️

* Duplicates: Found 1 similar files across 2 code sources (both identical + similar)
  accounting for 108 bundled bytes.
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

        const verboseReport = `Duplicate Sources / Packages - Duplicates found! ⚠️

* Duplicates: Found 1 similar files across 2 code sources (both identical + similar)
  accounting for 108 bundled bytes.
* Packages: Found 1 packages with 1 resolved, 2 installed, and 2 depended versions.

## bundle.js
foo (Found 1 resolved, 2 installed, 2 depended. Latest 1.1.1.)
  1.1.1
    ~/foo
      * Dependency graph
        multiple-resolved-no-duplicates@1.2.3 -> foo@^1.0.0
      * Duplicated files in bundle.js
        foo/index.js (I, 54)

    ~/uses-foo/~/foo
      * Dependency graph
        multiple-resolved-no-duplicates@1.2.3 -> uses-foo@^1.0.9 -> foo@^1.0.1
      * Duplicated files in bundle.js
        foo/index.js (I, 54)

* Understanding the report: Need help with the details? See:
  https://github.com/FormidableLabs/inspectpack/#diagnosing-duplicates
* Fixing bundle duplicates: An introductory guide:
  https://github.com/FormidableLabs/inspectpack/#fixing-bundle-duplicates
`;
        // tslint:enable max-line-length

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
          let origChalkEnabled;

          beforeEach(() => {
            // Stash and disable chalk for tests.
            origChalkEnabled = chalk.enabled;
            chalk.enabled = false;
          });

          afterEach(() => {
            chalk.enabled = origChalkEnabled;
          });

          it(`produces a default report`, () => {
            const plugin = new DuplicatesPlugin();

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
        });

      });
    });
  });
});
