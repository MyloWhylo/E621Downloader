import E6API from "./e621-api.js"
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import pLimit from 'p-limit';
import { getFileNamesRecursive } from "./dirParser.js";
const limit = pLimit(4);

const config = JSON.parse(readFileSync("./config/config.json", 'utf-8'))

export default class E6Grabber {
   #e6API;

   constructor(searchSize, pageSize, folders) {
      this.#e6API = new E6API(searchSize, pageSize);
      this.folders = folders
   }

   isBlacklisted(post) {
      for (let tag of config.blacklist) {
         for (let tagGroup in post.tags) {
            if (post.tags[tagGroup].includes(tag)) return true
         }
      }
      return false
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

   parseInput(input) {
      console.log("Parsing Inputs...");
      let r = JSON.parse(readFileSync(input, 'utf-8'));
      return r
   }

   async queueDownloads(baseLocation, toDownload, relatives = true, forceCheck) {
      console.log("Preparing to queue...");
      let fNames = await getFileNamesRecursive(baseLocation);
      let inputs = this.parseInput(toDownload);

      let r = [];

      process.stdout.write("Queueing pools");

      let allPools = await this.#e6API.getMultiplePoolsMetadata(inputs.pools);
      for (const poolMetadata of allPools) {
         let name = `${poolMetadata.id} - ${poolMetadata.name}`;

         let thisPool = fNames.pools;
         let hasMember = poolMetadata.id in thisPool;
         let postsOnDisk = hasMember ? thisPool[poolMetadata.id].length : 0;

         process.stdout.write(postsOnDisk == poolMetadata.post_count ? '.' : '!');

         if (postsOnDisk == poolMetadata.post_count) continue;
         else if (postsOnDisk > poolMetadata.post_count) {
            console.error(`Pool ${poolMetadata.name} (${poolMetadata.id}) has more posts on disk than in the pool!`);
         }
         let folder = join(baseLocation, "Pools", name);
         let poolPosts = await this.#e6API.getPoolPosts(poolMetadata.id);

         for (const post of poolPosts) {
            let fileOnDisk = hasMember ? thisPool[poolMetadata.id].includes(post.id.toString()) : false;
            if (fileOnDisk && !forceCheck) continue;
            let thisPost = {};
            thisPost.post = post;
            thisPost.location = folder;
            r.push(thisPost);
         }
      }

      process.stdout.write("\nQueueing posts");
      let postsFolder = join(baseLocation, "Posts");
      for (const post of inputs.posts) {
         let hasMember = post in fNames.posts;
         
         let existsOnDisk = hasMember ? fNames.posts[post].includes(post.toString()) : false;
         if (existsOnDisk && !forceCheck) continue;

         let initialPost = await this.#e6API.getPost(post);
         let thisPostFolder = join(postsFolder, post.toString());
         if (relatives) {
            let rootNode = await this.findRootPost(initialPost);
            for (const relative of await this.findRelatives(rootNode)) {
               if (this.isBlacklisted(relative)) continue;
               let thisPost = {
                  post: relative,
                  location: thisPostFolder
               };
               r.push(thisPost);
            }
         } else {
            let thisPost = {
               post: initialPost,
               location: thisPostFolder
            };
            r.push(thisPost);
         }
         process.stdout.write('.')
      }

      process.stdout.write("\nQueueing searches");
      for (const search of inputs.searches) {
         let tags = search.query;
         let limit = search.limit;
         let searchFolder = join(baseLocation, "Searches", tags);

         let inTags = tags.split(" ");
         let searchTags = "";

         for (let tag of inTags) {
            searchTags += `${tag}+`;
         }

         for (let tag of config.blacklist) {
            searchTags += `-${tag}+`
         }

         let infinite = (limit == -1) ? true : false;
         let results = await this.#e6API.getSearch(searchTags, limit = limit, infinite = infinite);
         process.stdout.write('.');

         for (const post of results) {
            let thisSearch = fNames.searches;
            let hasMember = tags in thisSearch;
            let existsOnDisk = hasMember ? thisSearch[tags].includes(post.id.toString()) : false;

            if (existsOnDisk && !forceCheck) continue;

            if (relatives) {
               let rootNode = await this.findRootPost(post);
               if (!rootNode.relationships.has_active_children) {
                  let thisPost = {};
                  thisPost.post = post;
                  thisPost.location = searchFolder;
                  r.push(thisPost);
               } else {
                  let folder = this.folders ? join(searchFolder, rootNode.id.toString()) : searchFolder;
                  let relatives = await this.findRelatives(rootNode);

                  for (const relative of relatives) {
                     if (this.isBlacklisted(relative)) continue;
                     let thisPost = {
                        post: relative,
                        location: folder
                     };
                     r.push(thisPost);
                  }
               }

            } else {
               let thisPost = {
                  post: post,
                  location: postsFolder
               };
               r.push(thisPost);
            }
         }
      }

      process.stdout.write("\nQueueing favorites");
      for (const user of inputs.favorites) {
         let userFolder = join(baseLocation, "Favorites", user);
         let results = await this.#e6API.getFavorites(user);
         process.stdout.write('.');

         for (const post of results.posts) {
            let users = fNames.favorites;
            let hasMember = user in users;

            let existsOnDisk = hasMember ? users[user].includes(post.id.toString()) : false;
            if (existsOnDisk && !forceCheck) continue;

            if (relatives) {
               let rootNode = await this.findRootPost(post);
               if (!rootNode.relationships.has_active_children) {
                  let thisPost = {};
                  thisPost.post = post;
                  thisPost.location = userFolder;
                  r.push(thisPost);
               } else {
                  let folder = this.folders ? join(userFolder, rootNode.id.toString()) : userFolder;
                  let relatives = await this.findRelatives(rootNode);
                  for (const relative of relatives) {
                     let thisPost = {
                        post: relative,
                        location: folder
                     };
                     r.push(thisPost);
                  }
               }

            } else {
               let thisPost = {
                  post: post,
                  location: postsFolder
               };
               r.push(thisPost);
            }
         }
      }
      console.log("");
      return r;
   }

   async downloadPosts(queue) {
      console.log("Downloading posts...");
      let prunedQueue = []
      for (const entry of queue) {
         let post = entry.post;
         let fname = `${post.id}.${post.file.ext}`;
         let name = join(entry.location, fname);

         if (!existsSync(entry.location)) {
            mkdirSync(entry.location, { recursive: true });
         }
         entry.name = name;
         if (!prunedQueue.some(e => e.name == entry.name)) prunedQueue.push(entry);
      }

      let promises = prunedQueue.map(entry => {
         return limit(async () => {
            console.log(`Downloading ${entry.name}`);
            let file = await this.#e6API.download(entry.post);
            writeFileSync(entry.name, Buffer.from(file));
         });
      });

      await (async () => {
         const result = await Promise.all(promises);
      })();

      console.log(`Downloaded ${this.#e6API.downloads} post${this.#e6API.downloads != 1 ? "s":""} in ${this.#e6API.requests} requests.`);
   }
}