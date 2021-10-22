import { readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import E6Grabber from "./utils/e6Grabber.js";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let listFile = join(__dirname, "config/inputFiles.txt");
let saveDir = join(__dirname, "e621");
let relatives = false;
let logLevel = 0;
let forceCheck = false;
let searchLimit = 75;
let pageLimit = 320;

for (let ii = 2; ii < process.argv.length; ii++) {
   if (process.argv[ii].toUpperCase() == "-INFILE") {
      if (
         typeof process.argv[ii + 1] != "undefined" &&
         process.argv[ii + 1].startsWith("-")
      ) {
         throw new Error("Command line arguments are invalid!");
      } else {
         listFile = resolve(process.argv[ii + 1]);
      }
   } else if (process.argv[ii].toUpperCase() == "-OUTFOLDER") {
      if (
         typeof process.argv[ii + 1] != "undefined" &&
         process.argv[ii + 1].startsWith("-")
      ) {
         throw new Error("Command line arguments are invalid!");
      } else {
         saveDir = resolve(process.argv[ii + 1]);
      }
   } else if (process.argv[ii].toUpperCase() == "-SEARCHLIMIT") {
      if (
         typeof process.argv[ii + 1] != "undefined" &&
         process.argv[ii + 1].startsWith("-")
      ) {
         throw new Error("Command line arguments are invalid!");
      } else {
         searchLimit = process.argv[ii + 1];
      }
   } else if (process.argv[ii].toUpperCase() == "-PAGELIMIT") {
      if (
         typeof process.argv[ii + 1] != "undefined" &&
         process.argv[ii + 1].startsWith("-")
      ) {
         throw new Error("Command line arguments are invalid!");
      } else {
         pageLimit = process.argv[ii + 1];
      }
   } else if (process.argv[ii].toUpperCase() == "-LOGLEVEL") {
      if (
         typeof process.argv[ii + 1] != "undefined" &&
         process.argv[ii + 1].startsWith("-")
      ) {
         throw new Error("Command line arguments are invalid!");
      } else {
         logLevel = process.argv[ii + 1];
      }
   } else if (process.argv[ii].toUpperCase() == "-RELATIVES") {
      relatives = true;
   } else if (process.argv[ii].toUpperCase() == "-FORCECHECK") {
      forceCheck = false;
   } else if (process.argv[ii].toUpperCase() == "-?" || process.argv[ii].toUpperCase() == "-HELP" ) {
      console.log(`E621Grabber by MyloWhylo (Version 1.2)\n`);
      console.log(`Usage\n  node main.js [options]\n`);
      console.log(`Defaults:`)
      console.log(`  inFile:\t./config/inputFiles.txt`);
      console.log(`  outFolder:\t./e621\n`);
      console.log(`Options:`);
      console.log(`  -inFile <filename>\tUse specified file instead of default`);
      console.log(`  -outFolder <dir>\tWrite to specified folder instead of default`);
      console.log(`  -searchLimit <limit>\tLimit searches to <limit> posts`);
      console.log(`  -pageLimit <limit>\tLimit posts per page to <limit> posts`);
      console.log(`  -logLevel <level>\tChanges log level (0-3)`);
      console.log(`  -relatives\t\tDownloads post relatives (very slow!)`);
      console.log(`  -forceCheck\t\tForce recheck of every post`);
      console.log(`  -?, -help\t\tPrints this screen`);
      process.exit();
   }
}

let data = readFileSync(listFile, "utf8");
data = data.split("\n");

let scraper = new E6Grabber(searchLimit, pageLimit, logLevel);

scraper.parseInput(data);
await scraper.queueDownloads(saveDir, relatives, forceCheck);
await scraper.downloadPosts();