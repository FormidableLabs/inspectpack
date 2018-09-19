import { actions } from "../lib";
import { IWebpackStats } from "../lib/interfaces/webpack-stats";

// Simple interfaces for webpack work.
// See, e.g. https://github.com/TypeStrong/ts-loader/blob/master/src/interfaces.ts
interface ICompiler {
  hooks: any;
  plugin: (name: string, callback: () => void) => void;
}

interface IStats {
  toJson: () => IWebpackStats;
}

export class InspectpackPlugin {
  public apply(compiler: ICompiler) {
    if (compiler.hooks) {
      // Webpack4 integration
      compiler.hooks.done.tap("inspectpack-plugin", this.analyze.bind(this));
    } else {
      // Webpack1-3 integration
      compiler.plugin("done", this.analyze.bind(this));
    }
  }

  public analyze(statsObj: IStats) {
    const stats = statsObj.toJson();
    Promise.all([
      actions("duplicates", { stats }),
      actions("versions", { stats }),
    ].map((p) => p.then((action) => action.getData())))
      .then((datas) => {
        const [ duplicates, versions ] = datas;
        const out = JSON.stringify({ duplicates, versions }, null, 2);
        console.log(out); // tslint:disable-line no-console
      });
  }
}
