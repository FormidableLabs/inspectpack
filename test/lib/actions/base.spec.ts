import { _getBaseName, _isNodeModules } from "../../../src/lib/actions/base";

describe("lib/actions/base", () => {
  describe("_getBaseName", () => {
    it("handles non-node_modules files", () => {
      expect(_getBaseName("")).to.equal(null);
      expect(_getBaseName("foo.js")).to.equal(null);
      expect(_getBaseName("./foo.js")).to.equal(null);
      expect(_getBaseName(".\\foo.js")).to.equal(null);
      expect(_getBaseName("bar/foo.js")).to.equal(null);
      expect(_getBaseName("bar\\foo.js")).to.equal(null);
      expect(_getBaseName("node_modulesM/bar/foo.js")).to.equal(null);
      expect(_getBaseName("node_modulesM\\bar\\foo.js")).to.equal(null);
    });

    it("removes node_modules", () => {
      expect(_getBaseName("./node_modules/foo.js")).to.equal("foo.js");
      expect(_getBaseName(".\\node_modules\\foo.js")).to.equal("foo.js");
      expect(_getBaseName("node_modules/bar/foo.js")).to.equal("bar/foo.js");
      expect(_getBaseName("node_modules\\bar\\foo.js")).to.equal("bar/foo.js");
    });

    it("removes repeated node_modules", () => {
      expect(_getBaseName("./node_modules/baz/node_modules/foo.js")).to.equal("foo.js");
      expect(_getBaseName(".\\node_modules\\baz\\node_modules\\foo.js")).to.equal("foo.js");
      expect(_getBaseName("bruh/node_modules/bar/foo.js")).to.equal("bar/foo.js");
      expect(_getBaseName("bruh\\node_modules\\bar\\foo.js")).to.equal("bar/foo.js");
    });

    it("handles synthetic modules", () => {
      expect(_getBaseName("node_modules/moment/locale sync /es/"))
        .to.equal("moment/locale sync /es/");
      expect(_getBaseName("node_modules\\moment/locale sync /es/"))
        .to.equal("moment/locale sync /es/");
    });

    // All of this behavior is negotiable.
    it("handles weird cases that should never come up", () => {
      expect(_getBaseName("node_modules")).to.equal("");
      expect(_getBaseName("node_modules/")).to.equal("");
      expect(_getBaseName("./node_modules")).to.equal("");
      expect(_getBaseName("./foo/bar/node_modules")).to.equal("");
    });
  });

  describe("_isNodeModules", () => {
    it("handles base cases", () => {
      expect(_isNodeModules("")).to.equal(false);
      expect(_isNodeModules("foo.js")).to.equal(false);
      expect(_isNodeModules("./foo.js")).to.equal(false);
      expect(_isNodeModules(".\\foo.js")).to.equal(false);
      expect(_isNodeModules("bar/foo.js")).to.equal(false);
      expect(_isNodeModules("bar\\foo.js")).to.equal(false);
      expect(_isNodeModules("node_modulesM/bar/foo.js")).to.equal(false);
      expect(_isNodeModules("node_modulesM\\bar\\foo.js")).to.equal(false);
    });

    it("removes node_modules", () => {
      expect(_isNodeModules("./node_modules/foo.js")).to.equal(true);
      expect(_isNodeModules(".\\node_modules\\foo.js")).to.equal(true);
      expect(_isNodeModules("node_modules/bar/foo.js")).to.equal(true);
      expect(_isNodeModules("node_modules\\bar\\foo.js")).to.equal(true);
    });

    it("removes repeated node_modules", () => {
      expect(_isNodeModules("./node_modules/baz/node_modules/foo.js")).to.equal(true);
      expect(_isNodeModules(".\\node_modules\\baz\\node_modules\\foo.js")).to.equal(true);
      expect(_isNodeModules("bruh/node_modules/bar/foo.js")).to.equal(true);
      expect(_isNodeModules("bruh\\node_modules\\bar\\foo.js")).to.equal(true);
    });

    // All of this behavior is negotiable.
    it("handles weird cases that should never come up", () => {
      expect(_isNodeModules("node_modules")).to.equal(true);
      expect(_isNodeModules("node_modules/")).to.equal(true);
      expect(_isNodeModules("./node_modules")).to.equal(true);
      expect(_isNodeModules("./foo/bar/node_modules")).to.equal(true);
    });
  });
});
