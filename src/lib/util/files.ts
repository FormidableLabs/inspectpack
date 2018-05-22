import { readdir, readFile, stat } from "fs";
import * as pify from "pify";

const readFileP = pify(readFile);
const readdirP = pify(readdir);
const statP = pify(stat);

// Read a file and parse into JSON.
export const readJson = (file: string) => Promise.resolve()
  .then(() => readFileP(file))
  .then((buf) => buf.toString("utf8"))
  .then((str) => JSON.parse(str));

// Permissively read directories, returning empty list of files if not.
export const readDir = (path: string): Promise<string[]> => Promise.resolve()
  .then(() => readdirP(path))
  // Remove dotfiles.
  .then((files) => files.filter((n: string) => !n.startsWith(".")))
  .catch((err) => {
    if (err.code === "ENOENT") { return []; } // Not found.
    throw err; // Rethrow real error.
  });

export const exists = (filePath: string) => Promise.resolve()
  .then(() => statP(filePath))
  .then(() => true)
  .catch((err) => {
    if (err.code === "ENOENT") { return false; } // Not found.
    throw err; // Rethrow real error.
  });

// Convert windows paths to mac/linux.
export const toPosixPath = (name: string) => name.split("\\").join("/");
