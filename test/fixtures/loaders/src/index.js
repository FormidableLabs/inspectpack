
/* eslint-disable no-console */

import text from "./hello.txt";
import style from "./style.css";

// Legacy: just require a file (gave up on `expose-loader` global in webpack5
// upgrade).
require("./bunny");

const hello = () => "hello world";

console.log("hello", hello());
console.log("text", text);
console.log("style", style.toString());
