import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import * as e6api from "./utils/e621-requester-v2.js";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

var listFile;
var saveDir;
var relatives = true;
var logging = true;
var searchLimit = 10;

let toDownload = {
   pools: [],
   posts: [],
   searches: [],
   favorites: [],
};

for (let ii = 2; ii < process.argv.length; ii++) {
   if (process.argv[ii] == "-i") {
      if (
         typeof process.argv[ii + 1] != "undefined" &&
         process.argv[ii + 1].startsWith("-")
      ) {
         throw new Error("Command line arguments are invalid!");
      } else {
         listFile = resolve(process.argv[ii + 1]);
      }
   } else if (process.argv[ii] == "-o") {
      if (
         typeof process.argv[ii + 1] != "undefined" &&
         process.argv[ii + 1].startsWith("-")
      ) {
         throw new Error("Command line arguments are invalid!");
      } else {
         saveDir = resolve(process.argv[ii + 1]);
      }
   } else if (process.argv[ii] == "-noRelatives") {
      relatives = false;
   }
}

if (typeof listFile == "undefined") {
   listFile = join(__dirname, "inputFiles.txt");
}

if (typeof saveDir == "undefined") {
   saveDir = join(__dirname, "e621");
}

let currentType = -1;
let data = readFileSync(listFile, "utf8");
data = data.split("\n");

e6api.parseInput(data, true);
await e6api.queueDownloads(saveDir, relatives, 10, true);
await e6api.downloadPosts();