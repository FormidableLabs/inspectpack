import { IWebpackStats } from "../lib/interfaces/webpack-stats";
import { INpmPackageBase } from "../lib/util/dependencies";

// ----------------------------------------------------------------------------
// Interfaces
// ----------------------------------------------------------------------------

export interface ICompiler {
  hooks?: any;
  plugin?: (name: string, callback: () => void) => void;
}

export interface ICompilation {
  errors: Error[];
  warnings: Error[];
  getStats: () => {
    toJson: (opts: object) => IWebpackStats;
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
// `~/different-foo/~/foo`
export const pkgNamePath = (pkgParts: INpmPackageBase[]) => pkgParts.reduce(
  (m, part) => `${m}${m ? " -> " : ""}${part.name}@${part.range}`,
  "",
);

export const versionpkgNamePath = (pkgParts: INpmPackageBase[]) => pkgParts.reduce(
  (m, part) => `${m}${m ? " -> " : ""}${part.name}@${part.version}`,
  "",
);
