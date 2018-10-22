import { join } from "path";

import * as mock from "mock-fs";
import * as sinon from "sinon";

import * as actionsDups from "../../../src/lib/actions/duplicates";
import * as actionsVersions from "../../../src/lib/actions/versions";

import { _getDuplicatesVersionsData } from "../../../src/plugin/duplicates";

import { EMPTY_VERSIONS_DATA, EMPTY_VERSIONS_META } from "../actions/versions.spec";
import { toPosixPath } from "../../../src/lib/util/files";
import { loadFixtures, VERSIONS } from "../../utils";
import { isExportDeclaration } from "typescript";

const MULTI_SCENARIO = "multiple-resolved-no-duplicates";

const EMPTY_DUPLICATES_DATA = {
  assets: {},
  meta: {
    dependedPackages: {
      num: 0,
    },
    files: {
      num: 0,
    },
    installedPackages: {
      num: 0,
    },
    packageRoots: [],
    skewedPackages: {
      num: 0,
    },
    skewedVersions: {
      num: 0,
    },
  },
};

const EMPTY_VERSIONS_DATA_ASSET = {
  meta: EMPTY_VERSIONS_META,
  packages: {}
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
          const noDupsVersions = _getDuplicatesVersionsData(
            multiDataDuplicates[vers - 1],
            multiDataVersions[vers - 1],
          );

          // Should remove all of the no-duplicates bundle.
          expect(noDupsVersions)
            .to.have.nested.property("assets.bundle-no-duplicates\\.js")
            .that.eql(EMPTY_VERSIONS_DATA_ASSET);

          // Should adjust for the index bundle (just foo).
          // TODO_INSERT_TEST
        });
      })
    })
  });
});
