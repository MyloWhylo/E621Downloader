import { readdir } from "fs/promises"
import { join, sep } from "path"

async function* ls(path = ".") {
   // yield path
   for (const dirent of await readdir(path, { withFileTypes: true }))
      if (dirent.isDirectory())
         yield* ls(join(path, dirent.name))
      else
         yield join(path, dirent.name)
}

async function* empty() { }

async function toObject(iter = empty()) {
   let r = {
      rawIDs: [],
      pools: {},
      posts: {},
      searches: {},
      favorites: {}
   };
   for await (const x of iter) {
      let dirStructure = x.split(sep);
      let poolLocation = dirStructure.findIndex((element) => element == "Pools");
      if (poolLocation != -1) {
         let poolName = dirStructure[poolLocation + 1].split(" - ").shift();
         if (!(poolName in r.pools)) {
            r.pools[poolName] = [];
         }
         r.pools[poolName].push(dirStructure.at(-1).split(".")[0]);
      }

      let postLocation = dirStructure.findIndex((element) => element == "Posts");
      if (postLocation != -1) {
         let postName = dirStructure[postLocation + 1];
         if (!(postName in r.posts)) {
            r.posts[postName] = [];
         }
         r.posts[postName].push(dirStructure.at(-1).split(".")[0]);
      }

      let searchLocation = dirStructure.findIndex((element) => element == "Searches");
      if (searchLocation != -1) {
         let searchName = dirStructure[searchLocation + 1];
         if (!(searchName in r.searches)) {
            r.searches[searchName] = [];
         }
         r.searches[searchName].push(dirStructure.at(-1).split(".")[0]);
      }

      let favLocation = dirStructure.findIndex((element) => element == "Favorites");
      if (favLocation != -1) {
         let favName = dirStructure[favLocation + 1];
         if (!(favName in r.favorites)) {
            r.favorites[favName] = [];
         }
         r.favorites[favName].push(dirStructure.at(-1).split(".")[0]);
      }

      r.rawIDs.push(dirStructure.at(-1).split(".")[0]);
   }
   return r
}

export async function getFileNamesRecursive(path) {
   return await toObject(ls(path))
}