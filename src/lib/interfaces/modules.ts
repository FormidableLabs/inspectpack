import { IWebpackStatsModuleBase } from "./webpack-stats";

// An inspectpack-extended version of a webpack source module.
export interface IModule extends IWebpackStatsModuleBase {
  // Normalized name as a package (removing `node_modules` prefixed-stuff).
  // Is `null` if not a `node_modules` package module.
  baseName: string | null;

  // Inferred path to a real file on disk (app or `node_modules`).
  // Is `null` if no real, single base file or in a loader/generated code
  // context a "better" contender exists as "the original".
  fullPath: string | null;

  // Is a vendor module / is part of a `node_modules` path.
  isNodeModules: boolean;

  // Is a "made up" module without actual source.
  isSynthetic: boolean;

  // We **change** `source` to allow `null` for synthetic modules.
  source: string | null;
}

// A token for synthetic modules "source".
export const SYNTHETIC_SOURCE_TOKEN = "synthetic";

// A "final data" version for reporting.
export interface IActionModule {
  baseName: string | null;
  fileName: string;
  fullPath: string | null;
  size: {
    full: number,
  };
}
