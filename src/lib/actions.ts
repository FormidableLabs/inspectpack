import { create as duplicates } from "./actions/duplicates";
import { create as sizes } from "./actions/sizes";
import { create as versions } from "./actions/versions";

import { IAction, IActionConstructor, TemplateFormat } from "./actions/base";
import { IWebpackStats } from "./interfaces/webpack-stats";

interface IActions {
  [key: string]: (opts: IActionConstructor) => IAction;
}

export const ACTIONS: IActions = {
  duplicates,
  sizes,
  versions,
};

export interface IRenderOptions extends IActionConstructor {
  action: "duplicates" | "sizes" | "versions";
  format: TemplateFormat;
  stats: IWebpackStats;
  ignoredPackages: (string | RegExp)[];
}

/**
 * Get action instance.
 *
 * @param name {String} name of action
 * @param opts {Object} action options
 * @param opts.stats {Object} webpack stats object
 * @returns {Promise<IAction>} action instance
 */
export const actions = (
  name: string,
  opts: IActionConstructor,
): Promise<IAction> => Promise.resolve()
  .then(() => {
    const create = ACTIONS[name];
    if (!create) {
      // This is a programming error. Arg parsing _should_ have caught already.
      throw new Error(`Unknown action: ${name}`);
    }

    const action = create(opts);
    return action.validate();
  });

/**
 * Render action to final template format.
 *
 * @param opts {IRenderOpts} action + render options
 * @param opts.action {String} name of action
 * @param opts.format {Object} output format
 * @param opts.stats {Object} webpack stats object
 * @returns {Promise<string>} Rendered result
 */
export const render = (
  { action, format, stats, ignoredPackages }: IRenderOptions,
): Promise<string> => Promise.resolve()
  .then(() => actions(action, { stats, ignoredPackages }))
  .then((instance: IAction) => instance.template.render(format));
