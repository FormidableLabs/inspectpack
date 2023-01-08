import { expect } from "chai";
import execa = require("execa");

// Have to use transpiled bin to exec in Node.js
const IP_PATH = require.resolve("../../bin/inspectpack.js");
const SIMPLE_STATS = require.resolve("../fixtures/simple/dist-development-5/stats.json");
const DUP_ESM_STATS = require.resolve("../fixtures/duplicates-esm/dist-development-5/stats.json");

const exec = (args: string[]) => execa("node", [IP_PATH].concat(args), {
  env: { ...process.env, NO_COLOR: "true" }
});

describe("bin/inspectpack", () => {
  // TODO(65): `bin` tests.
  // https://github.com/FormidableLabs/inspectpack/issues/65
  it("needs more tests");

  describe("-h", () => {
    it("displays help by default with error exit", async () => {
      const { exitCode, stderr } = await exec([]).catch((e) => e);
      expect(exitCode).to.eql(1);
      expect(stderr).to.contain("Usage: inspectpack");
    });

    it("displays help with flag with normal exit", async () => {
      const { exitCode, stdout } = await exec(["-h"]);
      expect(exitCode).to.eql(0);
      expect(stdout).to.contain("Usage: inspectpack");
    });
  });

  describe("--bail", () => {
    it("passes on simple sizes", async () => {
      const { exitCode, stdout } = await exec(["-s", SIMPLE_STATS, "-a", "sizes", "-b"]);
      expect(exitCode).to.eql(0);
      expect(stdout).to.contain("inspectpack --action=sizes");
    });

    it("passes on simple duplicates", async () => {
      const { exitCode, stdout } = await exec(["-s", SIMPLE_STATS, "-a", "duplicates", "-b"]);
      expect(exitCode).to.eql(0);
      expect(stdout).to.match(/Extra Files \(unique\)\:[ ]+0/);
    });

    it("passes on simple versions", async () => {
      const { exitCode, stdout } = await exec(["-s", SIMPLE_STATS, "-a", "versions", "-b"]);
      expect(exitCode).to.eql(0);
      expect(stdout).to.match(/Packages with skews:[ ]+0/);
    });

    it("passes on duplicates-esm sizes", async () => {
      const { exitCode, stdout } = await exec(["-s", DUP_ESM_STATS, "-a", "sizes", "-b"]);
      expect(exitCode).to.eql(0);
      expect(stdout).to.contain("inspectpack --action=sizes");
    });

    it("bails on duplicates-esm duplicates", async () => {
      const { exitCode, stdout, stderr } =
        await exec(["-s", DUP_ESM_STATS, "-a", "duplicates", "-b"]).catch((e) => e);
      expect(exitCode).to.eql(1);
      expect(stdout).to.match(/Extra Files \(unique\)\:[ ]+1/);
      expect(stderr).to.contain("Issues found in action: duplicates");
    });

    it("bails on duplicates-esm versions", async () => {
      const { exitCode, stdout, stderr } =
        await exec(["-s", DUP_ESM_STATS, "-a", "versions", "-b"]).catch((e) => e);
      expect(exitCode).to.eql(1);
      expect(stdout).to.match(/Packages with skews:[ ]+1/);
      expect(stderr).to.contain("Issues found in action: versions");
    });
  });
});
