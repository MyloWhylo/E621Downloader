import fetch from "node-fetch";
import { createRequire } from "module"; // Bring in the ability to create the 'require' method
import { writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

const require = createRequire(import.meta.url); // construct the require method
const config = require("./config.json"); // use the require method

const options = {
	headers: {
		"User-Agent": "E6Grabber/1.1 (by MyloWhylo on e621)",
		"Authorization": new Buffer.from(`${config.username}:${config.api_key}`).toString("base64")
	}
};

var parsedInput = {
	pools: [],
	posts: [],
	searches: [],
	favorites: [],
};

var downloadQueue = [];

async function findRelatives(post) {
	let children = [post];
	if (post.relationships.has_active_children == false) {
		// I chose active children because it is false if has_children is false,
		// and additionally if the child post was deleted or removed.
		// I don't want deleted posts.
		return children;
	}

	for (const child of post.relationships.children) {
		let childData = await getPost(child);
		if (childData == -1) continue;
		else children.push(await findRelatives(childData));
	}
	return children.flat(Infinity);
}

async function findRootPost(post) {
	let highest = post;
	console.log(highest.id);

	while (highest.relationships.parent_id != null) {
		console.log(highest.relationships.parent_id);
		let newHighest = await getPost(highest.relationships.parent_id);
		if (newHighest == -1) break;
		else highest = newHighest;
		console.log(highest.id);
	}
	console.log();
	return highest;
}


export function parseInput(input, logging = false) {
	if (logging) console.log("Parsing Inputs...");
	let currentType = -1;
	for (const line of input) {
		if (line == "") continue; // Ignore blank line
		else if (line.startsWith("#")) { // On comment detect, increment type counter
			currentType++;
			continue;
		} else {
			switch (currentType) {
				case 0: // Add Pool
					parsedInput.pools.push(line.trim());
					break;

				case 1: // Add Post
					parsedInput.posts.push(line.trim());
					break;

				case 2: // Add Search
					parsedInput.searches.push(line.trim());
					break;

				case 3: // Add User
					parsedInput.favorites.push(line.trim());
					break;
			}
		}
	}
	if (logging) console.log("Parsed.");
}

export async function queueDownloads(baseLocation, relatives = true, searchLimit = 10, logging = false) {
	if (logging) console.log("Queueing pools...");
	for (const pool of parsedInput.pools) {
		let poolData = await getPool(pool);
		let name = `${poolData.metadata.name} - ${poolData.metadata.id}`;
		if (logging) console.log(`\tPool ${name}, length: ${poolData.posts.length}`);
		let folder = join(baseLocation, "Pools", name);

		// This should be in download function
		// if (!existsSync(folder)) {
		// 	mkdirSync(folder, { recursive: true });
		// }

		for (const post of poolData.posts) {
			var thisPost = {};
			thisPost.post = post;
			thisPost.location = folder;
			downloadQueue.push(thisPost);
		}
	}

	if (logging) console.log("Queueing posts...");
	for (const post of parsedInput.posts) {
		let postsFolder = join(baseLocation, "Posts");
		if (relatives) {
			let rootNode = findRootPost(await getPost(post));
			let folder = join(postsFolder, rootNode.id);
			for (const relative of await findRelatives(rootNode)) {
				var thisPost = {};
				thisPost.post = relative;
				thisPost.location = folder;
				downloadQueue.push(thisPost);
			}
		} else {
			var thisPost = {};
			thisPost.post = await getPost(post);
			thisPost.location = postsFolder;
			downloadQueue.push(thisPost);
		}
	}

	if (logging) console.log("Queueing Searches...");
	for (const search of parsedInput.searches) {
		let searchFolder = join(baseLocation, "Searches", search);
		let results = await getSearch(search, searchLimit);
		for (const post of results.posts) {
			if (relatives) {
				let rootNode = await findRootPost(post);
				if (!rootNode.relationships.has_active_children) {
					let thisPost = {};
					thisPost.post = post;
					thisPost.location = searchFolder;
					downloadQueue.push(thisPost);
				} else {
					let folder = join(searchFolder, rootNode.id.toString());
					let relatives = await findRelatives(rootNode);
					for (const relative of relatives) {
						let thisPost = {};
						thisPost.post = relative;
						thisPost.location = folder;
						downloadQueue.push(thisPost);
					}
				}

			} else {
				let thisPost = {};
				thisPost.post = post;
				thisPost.location = searchFolder;
				downloadQueue.push(thisPost);
			}
		}
	}

	if (logging) console.log("Queueing favorites...");
	for (const user of parsedInput.favorites) {
		if (logging) console.log(`\tUser: ${user}`);
		let userFolder = join(baseLocation, "Favorites", user);
		let results = await getFavorites(user);

		for (const post of results.posts) {
			if (relatives) {
				let rootNode = await findRootPost(post);
				if (!rootNode.relationships.has_active_children) {
					let thisPost = {};
					thisPost.post = post;
					thisPost.location = userFolder;
					downloadQueue.push(thisPost);
				} else {
					let folder = join(userFolder, rootNode.id.toString());
					let relatives = await findRelatives(rootNode);
					for (const relative of relatives) {
						let thisPost = {};
						thisPost.post = relative;
						thisPost.location = folder;
						downloadQueue.push(thisPost);
					}
				}

			} else {
				let thisPost = {};
				thisPost.post = post;
				thisPost.location = userFolder;
				downloadQueue.push(thisPost);
			}
		}
	}
	if (logging) console.log("Queueing done.");
}

export async function downloadPosts() {
	console.log("Downloading posts...");
	for (const entry of downloadQueue) {
		let post = entry.post;
		let url = post.file.url;
		let fname = `${post.id}.${post.file.ext}`;
		let name = join(entry.location, fname);

		if (existsSync(name)) continue;
		else {
			if (!existsSync(entry.location)) {
				mkdirSync(entry.location, { recursive: true });
			}

			try {
				await download(url, name)
			} catch (error) {
				console.error(error);
			}
		}
	}

	console.log("Downloaded posts!");
}

export async function download(url, filename) {
	console.log(`Downloading ${filename}`);
	const response = await fetch(url);
	const buffer = await response.buffer();
	writeFileSync(filename, buffer);
	return;
}

export async function getPost(postID) {
	let url = `https://e621.net/posts.json?tags=id%3A${postID}`;
	const response = await fetch(url, options);
	const data = await response.json();

	if (data.posts.length == 0 || data.posts[0].id != postID) return -1
	else return data.posts[0];
}

export async function getSearch(inTags, limit = 10) {
	inTags = inTags.split(" ");
	let searchTags = "";
	let len = inTags.length;

	for (let ii = 0; ii < len; ii++) {
		if (ii) searchTags += "+";
		searchTags += inTags[ii];
	}

	let url = `https://e621.net/posts.json?tags=${searchTags}&limit=${limit}`;
	const response = await fetch(url, options);
	const data = await response.json();
	return data;
}

export async function getPool(poolID, page = 1) {
	let poolUrl = `https://e621.net/pools.json?search%5Bid%5D=${poolID}`;
	const poolQuery = await fetch(poolUrl, options);
	const poolMetadata = await poolQuery.json();

	if (poolMetadata[0].id != poolID) {
		throw new Error("Retrieved pool does not match requested pool!");
	}

	let dataUrl = `https://e621.net/posts.json?tags=pool%3A${poolID}&page=${page}`;
	const dataQuery = await fetch(dataUrl, options);
	const data = await dataQuery.json();

	if (!data.posts[0].pools.includes(parseInt(poolID))) {
		throw new Error("Retrieved pool does not match requested pool!");
	}

	let returnValue = {};
	returnValue.metadata = poolMetadata[0];
	returnValue.posts = data.posts;
	if (data.posts.length === 75) {
		let newData = await getPool(poolID, page + 1);
		returnValue.posts = returnValue.posts.concat(newData.posts);
	}
	return returnValue;
}

export async function getFavorites(username, page = 1) {
	console.log(username, page);
	let url = `https://e621.net/posts.json?tags=fav%3A${username}&page=${page}`;
	const response = await fetch(url, options);
	const data = await response.json();
	console.log(`got faves, length ${data.posts.length}`);
	if (data.posts.length === 75) {
		let newData = await getFavorites(username, page + 1);
		data.posts = data.posts.concat(newData.posts);
	}
	console.log(`swaggin, returning data`);
	writeFileSync('./userfaves.json', JSON.stringify(data, null, 3));
	return data;
}
