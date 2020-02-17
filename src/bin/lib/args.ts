import * as yargs from "yargs";

import {
  ACTIONS,
  IRenderOptions,
  readJson,
  TemplateFormat,
} from "../../lib";

// Validate and normalize.
const validate = (parser: yargs.Argv): Promise<IRenderOptions> => {
  const { argv } = parser;
  const { action, format, ignoredPackages } = argv;

  // Defaults
  const statsFile = argv.stats as string;

  return readJson(statsFile).then((stats) => ({
    action,
    format,
    ignoredPackages,
    stats,
  }) as IRenderOptions);
};

const args = () => yargs
  .usage(`Usage: inspectpack -s <file> -a <action> [options]`)

  // Actions
  .option("action", {
    alias: "a",
    choices: Object.keys(ACTIONS),
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

  // Ignores
  .option("ignored-packages", {
    alias: "i",
    default: [],
    describe: "List of space separated packages to ignore",
    type: "array",
  })

  // Logistical
  .help().alias("help", "h")
  .version().alias("version", "v")
  .strict();

export const parse = (): Promise<IRenderOptions> => validate(args());
