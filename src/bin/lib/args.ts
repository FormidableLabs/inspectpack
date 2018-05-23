import * as yargs from "yargs";

import {
  ACTIONS,
  IRenderOptions,
  readJson,
  TemplateFormat,
} from "../../lib";

const ACTION_KEYS = Object.keys(ACTIONS);

// Validate and normalize.
const validate = (parser: yargs.Argv): Promise<IRenderOptions> => {
  const { argv } = parser;
  const { action, format } = argv;

  // Defaults
  const statsFile = argv.stats;

  return Promise.resolve()
    // Stats
    .then(() => readJson(statsFile))
    // Final object
    .then((stats) => ({
      action,
      format,
      stats,
    }));
};

const args = () => yargs
  .usage(`Usage: inspectpack -s <file> -a <action> [options]`)

  // Actions
  .option("action", {
    alias: "a",
    choices: ACTION_KEYS,
    describe: "Actions to take",
    required: true,
    type: "string",
  })
  .example(
    "inspectpack -s stats.json -a duplicates",
    "Show duplicates files",
  )
  .example(
    "inspectpack -s stats.json -a versions",
    "Show version skews in a project",
  )
  .example(
    "inspectpack -s stats.json -a sizes",
    "Show raw file sizes",
  )

  // Files
  .option("stats", {
    alias: "s",
    describe: "Path to webpack-created stats JSON object",
    required: true,
    type: "string",
  })

  // Display
  .option("format", {
    alias: "f",
    choices: Object.keys(TemplateFormat),
    default: TemplateFormat.text,
    describe: "Display output format",
    type: "string",
  })

  // Logistical
  .help().alias("help", "h")
  .version().alias("version", "v")
  .strict();

export const parse = (): Promise<IRenderOptions> => validate(args());
