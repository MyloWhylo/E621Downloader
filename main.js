import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import * as e6api from "./utils/e621-requester.js";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

var listFile;
var saveDir;

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
  }
}

if (typeof listFile == "undefined") {
  listFile = join(__dirname, "inputFiles.txt");
}

if (typeof saveDir == "undefined") {
  saveDir = join(__dirname, "e621");
}

let currentFill = -1;
let data = readFileSync(listFile, "utf8");
data = data.split("\n");

for (const line of data) {
  if (line == "") continue;
  else if (line.startsWith("#")) {
    currentFill++;
    continue;
  } else {
    switch (currentFill) {
      case 0:
        toDownload.pools.push(line.trim());
        break;

      case 1:
        toDownload.posts.push(line.trim());
        break;

      case 2:
        toDownload.searches.push(line.trim());
        break;

      case 3:
        toDownload.favorites.push(line.trim());
        break;
    }
  }
}

for (const pool of toDownload.pools) {
  await e6api.downloadPool(pool, saveDir);
}

let postDir = join(saveDir, "Posts");
toDownload.posts.length > 0 && !existsSync(postDir) && mkdirSync(postDir, { recursive: true });
for (const post of toDownload.posts) {
  await e6api.downloadPost(post, postDir);
}

for (const user of toDownload.favorites) {
  await e6api.downloadFavorites(user, saveDir);
}
