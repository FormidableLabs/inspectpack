import * as yargs from "yargs";

import {
  ACTIONS,
  IRenderOptions,
  readJson,
  TemplateFormat,
} from "../../lib";

export interface ICliOptions extends IRenderOptions {
  bail: boolean
}

// Validate and normalize.
const validate = (parser: yargs.Argv): Promise<ICliOptions> => {
  const { argv } = parser;
  const { action, format, ignoredPackages, bail } = argv;

  // Defaults
  const statsFile = argv.stats as string;

  return readJson(statsFile).then((stats) => ({
    action,
    format,
    ignoredPackages,
    stats,
    bail,
  }) as ICliOptions);
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
    describe: "List of package names (space separated) to ignore",
    type: "array",
  })

  // Ignores
  .option("bail", {
    alias: "b",
    default: false,
    describe: "Exit non-zero if duplicates/versions results found",
    type: "boolean",
  })


  // Logistical
  .help().alias("help", "h")
  .version().alias("version", "v")
  .strict();

export const parse = (): Promise<ICliOptions> => validate(args());
