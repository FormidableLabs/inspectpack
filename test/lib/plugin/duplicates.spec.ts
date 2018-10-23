import { join } from "path";

import * as mock from "mock-fs";
import * as sinon from "sinon";

import * as actionsDups from "../../../src/lib/actions/duplicates";
import * as actionsVersions from "../../../src/lib/actions/versions";

import { _getDuplicatesVersionsData } from "../../../src/plugin/duplicates";

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
});
