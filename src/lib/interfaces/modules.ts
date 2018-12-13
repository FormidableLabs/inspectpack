import { IWebpackStatsModuleBase } from "./webpack-stats";

// An inspectpack-extended version of a webpack source module.
export interface IModule extends IWebpackStatsModuleBase {
  // Normalized name as a package (removing `node_modules` prefixed-stuff).
  // Is `null` if not a `node_modules` package module.
  baseName: string | null;

  // Posix path to file on disk included in the bundle.
  fullPath: string | null;

  // Is a vendor module / is part of a `node_modules` path.
  isNodeModules: boolean;

  // Is a vendor module / is part of a `node_modules` path.
  //
  // TODO(FULL_PATH): Does this comment need more nuance?
  isSynthetic: boolean;

  // We **change** `source` to allow `null` for synthetic modules.
  source: string | null;
}

// A token for synthetic modules "source".
export const SYNTHETIC_SOURCE_TOKEN = "synthetic";

// A "final data" version for reporting.
//
// TODO(FULL_PATH): Consider switching to / adding `fullPath`.
export interface IActionModule {
  baseName: string | null;
  fileName: string;
  fullPath: string | null; //  TODO(FULL_PATH): Need `| null`?
  size: {
    full: number,
  };
}
