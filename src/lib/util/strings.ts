import * as chalk from "chalk";

export const numF = (val: string | number) => chalk.bold.cyan(val.toString());

export const sort = (a: string, b: string) => a.localeCompare(b);
