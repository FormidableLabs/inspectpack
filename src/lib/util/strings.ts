import * as colors from "picocolors";

export const numF = (val: string | number) => colors.bold(colors.cyan(val.toString()));

export const sort = (a: string, b: string) => a.localeCompare(b);
