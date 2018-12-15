/*tslint:disable variable-name*/
import * as t from "io-ts";

/**
 * Webpack module object interfaces.
 *
 * We use two "types" of interfaces here:
 * - `I<name>`: A standard TypeScript type/interface. Compiled away.
 * - `R<name>`: A outputted to `lib` `io-ts` data structure for runtime type
 *   checking.
 *
 * The webpack stats module objects have two "flavors":
 * - An object containing `source` with stringified source code.
 * - An object containing a modules array at the `modules` field.
 *
 * We bridge both with these compile + runtime types.
 */

// Common
const RWebpackStatsChunk = t.union([t.string, t.number]);

export type IWebpackStatsChunk = t.TypeOf<typeof RWebpackStatsChunk>;

// ----------------------------------------------------------------------------
// Assets
// ----------------------------------------------------------------------------
const RWebpackStatsAsset = t.type({
 // Chunk identifiers.
  chunks: t.array(RWebpackStatsChunk),
  // Output file name.
  name: t.string,
  // Estimated byte size of module.
  size: t.number,
});

export type IWebpackStatsAsset = t.TypeOf<typeof RWebpackStatsAsset>;

// ----------------------------------------------------------------------------
// Array of assets.
// ----------------------------------------------------------------------------
const RWebpackStatsAssets = t.array(RWebpackStatsAsset);

export type IWebpackStatsAssets = t.TypeOf<typeof RWebpackStatsAssets>;

// ----------------------------------------------------------------------------
// Module: Base types
// ----------------------------------------------------------------------------
const RWebpackStatsModuleBase = t.type({
  // Chunk identifiers.
  chunks: t.array(RWebpackStatsChunk),
  // Full path to file on disk (with extra hash stuff if `modules` module).
   // Full path to file on disk (with extra hash stuff if `modules` module and
  // loader prefixes, etc.).
  identifier: t.string,
   // Estimated byte size of module.
  size: t.number,
});

// Added fields for some modules that we _don't_ want in the base fields.
const RWebpackStatsModuleWithName = t.type({
  // An absolute (webpack v1-3) or relative (webpack v4) name of the module.
  //
  // Forms:
  // - v1, v2: "/PATH/TO/ROOT/~/pkg/index.js"
  // - v3: "/PATH/TO/ROOT/node_modules/pkg/index.js"
  // - v4: "./node_modules/pkg/index.js"
  name: t.string,
});

export type IWebpackStatsModuleBase = t.TypeOf<typeof RWebpackStatsModuleBase>;

// ----------------------------------------------------------------------------
// Module: Single code **source**
// ----------------------------------------------------------------------------
export const RWebpackStatsModuleSource = t.intersection([
  RWebpackStatsModuleBase,
  RWebpackStatsModuleWithName,
  t.type({
    // Raw source, stringified
    source: t.string,
  }),
]);

export type IWebpackStatsModuleSource = t.TypeOf<typeof RWebpackStatsModuleSource>;

// ----------------------------------------------------------------------------
// Module: Single "synthetic" module
//
// This is a module created from webpack-specific programming / macros. E.g.
//
// ```js
// {
//   "identifier": "/PATH/TO/PROJECT/node_modules/moment/locale /es/",
//   "name": "../moment/locale es",
//   "size": 235,
// }
// ```
//
// with no `source` or `modules`. This translates to bundle code of:
//
// ```js
// /***/ (function(module, exports, __webpack_require__) {
//
//   var map = {
//     "./es": 4,
//     "./es-do": 5,
//     "./es-do.js": 5,
//     "./es-us": 6,
//     "./es-us.js": 6,
//     "./es.js": 4
//   };
//   // ... webpack boilerplate stuff to load the files ...
// ```
// ----------------------------------------------------------------------------
// Just alias base.
export const RWebpackStatsModuleSynthetic = t.intersection([
  RWebpackStatsModuleBase,
  RWebpackStatsModuleWithName,
]);
export type IWebpackStatsModuleSynthetic = t.TypeOf<typeof RWebpackStatsModuleSynthetic>;

// ----------------------------------------------------------------------------
// Module: More **modules**
// ----------------------------------------------------------------------------
export interface IWebpackStatsModuleModules extends IWebpackStatsModuleBase {
  modules: Array<IWebpackStatsModuleSource | IWebpackStatsModuleModules>;
}

export const RWebpackStatsModuleModules = t.recursion<IWebpackStatsModuleModules>(
  "RWebpackStatsModuleModules",
  (self) => t.intersection([
    RWebpackStatsModuleBase,
    t.type({
      // More levels of modules.
      // https://webpack.js.org/api/stats/#module-objects
      modules: t.array(t.union([
        RWebpackStatsModuleSource,
        self,
      ])),
    }),
  ]),
);

// ----------------------------------------------------------------------------
// Module: Either `source` or `modules` types.
// ----------------------------------------------------------------------------
const RWebpackStatsModule = t.union([
  RWebpackStatsModuleSource,
  RWebpackStatsModuleSynthetic,
  RWebpackStatsModuleModules,
]);

export type IWebpackStatsModule = t.TypeOf<typeof RWebpackStatsModule>;

// ----------------------------------------------------------------------------
// Array of modules.
// ----------------------------------------------------------------------------
const RWebpackStatsModules = t.array(RWebpackStatsModule);

export type IWebpackStatsModules = t.TypeOf<typeof RWebpackStatsModules>;

// ----------------------------------------------------------------------------
// The full webpack stats object.
// ----------------------------------------------------------------------------
// tslint:disable-next-line variable-name
export const RWebpackStats = t.interface({
  assets: RWebpackStatsAssets,
  modules: RWebpackStatsModules,
});

export type IWebpackStats = t.TypeOf<typeof RWebpackStats>;
