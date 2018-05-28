
/* eslint-disable no-console */
/* globals global */

import text from "./hello.txt";
import style from "./style.css";

// Use expose loader to make global
require("expose-loader?BunBun!./bunny"); // eslint-disable-line import/no-unresolved

const hello = () => "hello world";

console.log("hello", hello());
console.log("text", text);
console.log("style", style.toString());

let root = typeof window !== "undefined" && window;
if (!root && typeof global !== "undefined") {
  root = global;
}

console.log("global", root.BunBun);
