import { IWebpackStats } from "../lib/interfaces/webpack-stats";

// Simple interfaces for webpack work.
// See, e.g. https://github.com/TypeStrong/ts-loader/blob/master/src/interfaces.ts
interface Compiler {
  hooks: any;
  plugin: (name: string, callback: Function) => void;
}

interface Stats {
  toJson: () => IWebpackStats;
}

export class InspectpackPlugin {
  public apply(compiler: Compiler) {
    if (compiler.hooks) {
      compiler.hooks.done.tap("inspectpack-plugin", this.analyze.bind(this));
    } else {
      compiler.plugin("done", this.analyze.bind(this));
    }
  }

  public analyze(stats: Stats) {
    const statsObj = stats.toJson();
    const out = `TODO HERE STATS: ${JSON.stringify(Object.keys(statsObj), null, 2)}`;
    console.log(out); // tslint:disable-line no-console
  }
}
