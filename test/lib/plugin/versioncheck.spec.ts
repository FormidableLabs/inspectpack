// test cases
// versionCheckPlugin analyze
// versionCheckPlugin verbose
// versionCheckPlugin fails

import { expect } from "chai";

import {
  isAllowedVersionViolated
} from "../../../src/plugin/versions";

describe("plugin/versionCheck", () => {
  describe("isAllowedVersionViolated", () => {
    it('passes when only one version is included with no specifier', () => {
      const packages = {
        'my-addon': {
          '1.2.3': {}
        }
      };

      expect(isAllowedVersionViolated({}, 'my-addon', packages)).to.eql(false);
    });

    it('allows prerelease versions with a `*` specifier', () => {
      const packages = {
        'my-addon': {
          '1.2.3': {},
          '2.0.0-beta.1': {},
        }
      };
      const allowedVersions = {
        'my-addon' : '*'
      }

      expect(isAllowedVersionViolated(allowedVersions, 'my-addon', packages)).to.eql(false);
    });

    it('fails when only one version is included that doesn\'t satisfy the specifier', () => {
      const packages = {
        'my-addon': {
          '1.2.3': {}
        }
      };

      const allowedVersions = {
        'my-addon': '^1.2.4',
      };

      expect(isAllowedVersionViolated(allowedVersions, 'my-addon', packages)).to.eql(true);
    });

    it('passes when only one version is included that satisfies the specifier', () => {
      const packages = {
        'my-addon': {
          '1.2.3': {}
        }
      };

      const allowedVersions = {
        'my-addon': '^1.2.0',
      };

      expect(isAllowedVersionViolated(allowedVersions, 'my-addon', packages)).to.eql(false);
    });

    it('fails when multiple versions are included and one doesn\'t satisfy the specifier', () => {
      const packages = {
        'my-addon': {
          '1.2.3': {},
          '1.4.2': {}
        },
        'foo': {
          '1.0.0': {}
        }
      };

      const allowedVersions = {
        'my-addon': '^1.4.0',
      };

      expect(isAllowedVersionViolated(allowedVersions, 'my-addon', packages)).to.eql(true);
    });

    it('passes when multiple versions are included that satisfy the specifier', () => {
      const packages = {
        'my-addon': {
          '1.4.2': {},
          '1.4.3': {}
        },
        'foo': {
          '1.0.0': {}
        }
      };

      const allowedVersions = {
        'my-addon': '^1.4.0',
      };

      expect(isAllowedVersionViolated(allowedVersions, 'my-addon', packages)).to.eql(false);
    });
  });
});
