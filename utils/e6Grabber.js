import E6API from "./e621-api.js"
import { writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, sep } from "path";
import pLimit from 'p-limit';
const limit = pLimit(4);

export default class E6Grabber {
   #parsedInput = {
      pools: [],
      posts: [],
      searches: [],
      favorites: [],
   };

   #existingFiles = {
      rawIDs: [],
      folderFiles: {}
   };

   #downloadQueue = [];

   #e6API;
   #logLevel;

   constructor(searchSize, pageSize, logLevel = 0) {
      this.#e6API = new E6API(searchSize, pageSize);
      this.#logLevel = logLevel;
   }

   async findRelatives(post) {
      let children = [post];
      if (post.relationships.has_active_children == false) {
         // I chose active children because it is false if has_children is false,
         // and additionally if the child post was deleted or removed.
         // I don't want deleted posts.
         return children;
      }

      for (const child of post.relationships.children) {
         let childData = await this.#e6API.getPost(child);
         if (childData == -1) continue;
         else children.push(await this.findRelatives(childData));
      }
      return children.flat(Infinity);
   }

   async findRootPost(post) {
      let highest = post;

      while (highest.relationships.parent_id != null) {
         let newHighest = await this.#e6API.getPost(highest.relationships.parent_id);
         if (newHighest == -1) break;
         else highest = newHighest;
      }
      return highest;
   }

   recursiveFindFNames(Directory) {
      if (this.#logLevel > 1) console.log(`Analyzing ${Directory}`);
      let files = readdirSync(Directory);
      files.forEach(File => {
         const Absolute = join(Directory, File);
         if (statSync(Absolute).isDirectory()) {
            return this.recursiveFindFNames(Absolute);
         }
         else {
            let dirStructure = Directory.split(sep);
            let poolLocation = dirStructure.findIndex((element) => element == "Pools");
            if (poolLocation != -1) {
               let poolName = dirStructure[poolLocation + 1].split(" - ").shift();
               if (!(poolName in this.#existingFiles.folderFiles)) {
                  this.#existingFiles.folderFiles[poolName] = 1
                  this.#existingFiles.folderFiles[poolName] = 1;
               }
               else this.#existingFiles.folderFiles[poolName]++;
            }
            return this.#existingFiles.rawIDs.push(File.split(".")[0]);
         }
      });
   }

   parseInput(input) {
      if (this.#logLevel > -1) console.log("Parsing Inputs...");
      let currentType = -1;
      for (const line of input) {
         if (line == "") continue; // Ignore blank line
         else if (line.startsWith("#")) { // On comment detect, increment type counter
            currentType++;
            continue;
         } else {
            switch (currentType) {
               case 0: // Add Pool
                  this.#parsedInput.pools.push(line.trim());
                  break;

               case 1: // Add Post
                  this.#parsedInput.posts.push(line.trim());
                  break;

               case 2: // Add Search
                  this.#parsedInput.searches.push(line.trim());
                  break;

               case 3: // Add User
                  this.#parsedInput.favorites.push(line.trim());
                  break;
            }
         }
      }
      if (this.#logLevel > 1) console.log(JSON.stringify(this.#parsedInput, null, 3));
      if (this.#logLevel > 0) console.log("Parsed.");
   }

   async queueDownloads(baseLocation, relatives = true, forceCheck) {
      if (this.#logLevel > 0) console.log("Analyzing currently existing files...");
      this.recursiveFindFNames(baseLocation);
      if (this.#logLevel > 1) console.log(JSON.stringify(this.#existingFiles.folderFiles, null, 3));
      if (this.#logLevel > -1) console.log("Queueing pools...");

      for (const pool of this.#parsedInput.pools) {
         let poolMetadata = await this.#e6API.getPoolMetadata(pool);
         let name = `${poolMetadata.id} - ${poolMetadata.name}`;

         let postsOnDisk = poolMetadata.id in this.#existingFiles.folderFiles ? this.#existingFiles.folderFiles[poolMetadata.id] : 0;
         if (this.#logLevel > 0) console.log(`\tPool ${poolMetadata.id}\texpected: ${poolMetadata.post_count},\ton disk: ${postsOnDisk}`);
         if (postsOnDisk == poolMetadata.post_count) continue;

         let folder = join(baseLocation, "Pools", name);
         let poolPosts = await this.#e6API.getPoolPosts(pool);

         for (const post of poolPosts) {
            if (this.#existingFiles.rawIDs.includes(post.id.toString()) && !forceCheck) continue;
            let thisPost = {};
            thisPost.post = post;
            thisPost.location = folder;
            this.#downloadQueue.push(thisPost);
         }
      }

      if (this.#logLevel > -1) console.log("Queueing posts...");
      for (const post of this.#parsedInput.posts) {
         let initialPost = await this.#e6API.getPost(post);
         if (this.#existingFiles.rawIDs.includes(initialPost.id.toString()) && !forceCheck) continue;
         let postsFolder = join(baseLocation, "Posts");
         if (relatives) {
            let rootNode = this.findRootPost(initialPost);
            let folder = join(postsFolder, rootNode.id);
            for (const relative of await this.findRelatives(rootNode)) {
               let thisPost = {};
               thisPost.post = relative;
               thisPost.location = folder;
               this.#downloadQueue.push(thisPost);
            }
         } else {
            let thisPost = {};
            thisPost.post = initialPost;
            thisPost.location = postsFolder;
            this.#downloadQueue.push(thisPost);
         }
      }

      if (this.#logLevel > -1) console.log("Queueing searches...");
      for (const search of this.#parsedInput.searches) {
         if (this.#logLevel > 0) console.log(`\tQuery: ${search}`);
         let searchFolder = join(baseLocation, "Searches", search);
         let results = await this.#e6API.getSearch(search);
         if (this.#logLevel > 1) console.log(search, JSON.stringify(results, null, 3));
         for (const post of results.posts) {
            let existsOnDisk = this.#existingFiles.rawIDs.includes(post.id.toString());
            let isInQueue = this.#downloadQueue.some(e => e.post.id == post.id);

            if (this.#logLevel > 1) console.log(post.id, existsOnDisk, isInQueue);
            if ((existsOnDisk || isInQueue) && !forceCheck) {
               if (this.#logLevel > 1) console.log(`\tSkipping post ${post.id}, already exists.`);
               continue;
            }
            
            if (relatives) {
               let rootNode = await this.findRootPost(post);
               if (!rootNode.relationships.has_active_children) {
                  let thisPost = {};
                  thisPost.post = post;
                  thisPost.location = searchFolder;
                  this.#downloadQueue.push(thisPost);
               } else {
                  let folder = join(searchFolder, rootNode.id.toString());
                  let relatives = await this.findRelatives(rootNode);
                  if (this.#logLevel > 1) console.log(JSON.stringify(relatives, null, 3));
                  for (const relative of relatives) {
                     let thisPost = {};
                     thisPost.post = relative;
                     thisPost.location = folder;
                     this.#downloadQueue.push(thisPost);
                  }
               }

            } else {
               let thisPost = {};
               thisPost.post = post;
               thisPost.location = searchFolder;
               this.#downloadQueue.push(thisPost);
            }
         }
      }

      if (this.#logLevel > -1) console.log("Queueing favorites...");
      for (const user of this.#parsedInput.favorites) {
         if (this.#logLevel > 0) console.log(`\tUser: ${user}`);
         let userFolder = join(baseLocation, "Favorites", user);
         let results = await this.#e6API.getFavorites(user);

         for (const post of results.posts) {
            let existsOnDisk = this.#existingFiles.rawIDs.includes(post.id.toString());
            let isInQueue = this.#downloadQueue.some(e => e.post.id == post.id);

            if (this.#logLevel > 1) console.log(post.id, existsOnDisk, isInQueue);
            if ((existsOnDisk || isInQueue) && !forceCheck) {
               if (this.#logLevel > 1) console.log(`\tSkipping post ${post.id}, already exists.`);
               continue;
            }
            if (relatives) {
               let rootNode = await this.findRootPost(post);
               if (!rootNode.relationships.has_active_children) {
                  let thisPost = {};
                  thisPost.post = post;
                  thisPost.location = userFolder;
                  this.#downloadQueue.push(thisPost);
               } else {
                  let folder = join(userFolder, rootNode.id.toString());
                  let relatives = await this.findRelatives(rootNode);
                  for (const relative of relatives) {
                     let thisPost = {};
                     thisPost.post = relative;
                     thisPost.location = folder;
                     this.#downloadQueue.push(thisPost);
                  }
               }

            } else {
               let thisPost = {};
               thisPost.post = post;
               thisPost.location = userFolder;
               this.#downloadQueue.push(thisPost);
            }
         }
      }
      if (this.#logLevel > 0) console.log("Queueing done.");
   }

   async downloadPosts() {
      if (this.#logLevel > -1) console.log("Downloading posts...");
      let prunedQueue = []
      for (const entry of this.#downloadQueue) {
         let post = entry.post;
         let fname = `${post.id}.${post.file.ext}`;
         let name = join(entry.location, fname);

         if (!existsSync(entry.location)) {
            mkdirSync(entry.location, { recursive: true });
         }
         entry.name = name;
         if (!prunedQueue.some(e => e.name == entry.name)) {
            if (this.#logLevel > 1) console.log(JSON.stringify(prunedQueue, null, 3));
            prunedQueue.push(entry);
         } else {
            if (this.#logLevel > 1) console.log(`Queue already includes entry!`);
         }
      }

      let promises = prunedQueue.map(entry => {
         return limit(async () => {
            if (this.#logLevel > 1) console.log(`Downloading ${entry.name}`);
            let file = await this.#e6API.download(entry.post);
            writeFileSync(entry.name, file);
         });
      });

      await (async () => {
         const result = await Promise.all(promises);
      })();

      if (this.#logLevel > -1) console.log("Downloaded posts!");
      if (this.#logLevel > 0) console.log(`Number of requests: ${this.#e6API.requests}`);
   }
}