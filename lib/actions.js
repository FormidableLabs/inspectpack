"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const duplicates_1 = require("./actions/duplicates");
const sizes_1 = require("./actions/sizes");
const versions_1 = require("./actions/versions");
exports.ACTIONS = {
    duplicates: duplicates_1.create,
    sizes: sizes_1.create,
    versions: versions_1.create,
};
/**
 * Get action instance.
 *
 * @param name {String} name of action
 * @param opts {Object} action options
 * @param opts.stats {Object} webpack stats object
 * @returns {Promise<IAction>} action instance
 */
exports.actions = (name, opts) => Promise.resolve()
    .then(() => {
    const create = exports.ACTIONS[name];
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
 * @param opts.format {Object} webpack stats object
 * @param opts.stats {Object} webpack stats object
 * @returns {Promise<string>} Rendered result
 */
exports.render = ({ action, format, stats }) => Promise.resolve()
    .then(() => exports.actions(action, { stats }))
    .then((instance) => instance.template.render(format));
