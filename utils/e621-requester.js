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

export async function download(url, filename) {
	const response = await fetch(url);
	const buffer = await response.buffer();
	writeFileSync(filename, buffer);
}

export async function getPost(postID) {
	let url = `https://e621.net/posts.json?tags=id%3A${postID}`;
	const response = await fetch(url, options);
	const data = await response.json();
	console.log(data);
	return data;
}

export async function getSearch(inTags, limit = 10) {
	inTags = inTags.split(" ");
	let searchTags = "";
	let len = inTags.length;

	for (let ii = 0; ii < len; ii++) {
		if (ii) searchTags += "+";
		searchTags += inTags[ii];
	}
	console.log(inTags);
	console.log(searchTags);

	let url = `https://e621.net/posts.json?tags=${searchTags}&limit=${limit}`;
	const response = await fetch(url, options);
	const data = await response.json();
	console.log(data);
	return data;
}

export async function getPool(poolID) {
	let url = `https://e621.net/pools.json?search%5Bid%5D=${poolID}`;
	const response = await fetch(url, options);
	const data = await response.json();
	console.log(data);
	return data;
}

export async function getFavorites(userID) {
	let url = `https://e621.net/favorites.json?user_id=${userID}`;
	const response = await fetch(url, options);
	const data = await response.json();
	console.log(data);
	return data;
}

export async function downloadPost(postID, location) {
	let post = await getPost(postID);
	let url = post.posts[0].file.url;
	let fname = `${post.posts[0].id}.${post.posts[0].file.ext}`;
	let name = join(location, fname);
	if (existsSync(name)) {
		return fname;
	} else {
		try {
			await download(url, name);
		} catch (error) {
			console.error(error);
		}
	}
	return;
}

export async function downloadPool(poolID, location) {
	let pool = await getPool(poolID);

	if (pool[0].id != poolID) {
		throw new Error("Retrieved pool does not match requested pool!");
	}

	let name = `${pool[0].name} - ${pool[0].id}`;
	let folder = join(location, "Pools", name);
	let poolPosts = pool[0].post_ids;
	let toDownload = [];

	if (!existsSync(folder)) {
		mkdirSync(folder, { recursive: true });
	}

	let files = readdirSync(folder);
	for (const post in poolPosts) {
		if (!files.some((ef) => ef.includes(poolPosts[post]))) {
			toDownload.push(poolPosts[post]);
		}
	}

	console.log(`Beginning download of pool ${name}`)
	for (const post of toDownload) {
		try {
			await downloadPost(post, folder);
		} catch (error) {
			console.error(error);
		}
	}
	console.log(`Finsihed download of pool ${name}`)
	return;
}

export async function downloadSearch(search, location, relatives, limit = 10) {
	let searchResults = await getSearch(search, limit);
	let folder = join(location, "Search", search);
	!existsSync(folder) && mkdirSync(folder, { recursive: true });

	console.log(`Beginning download of search ${search}`)
	for (const post of searchResults.posts) {
		let url = post.file.url;
		let fname = `${post.id}.${post.file.ext}`;
		let name;

		if (relatives) {
			if (post.has_children) {
				name = join(folder, post.id, fname);
			} if (post.parent_id != null) {
				try {
					await download(url, name);
				} catch (error) {
					console.error(error);
				}
			}
		}
		else {
			name = join(folder, fname);
		}

		if (existsSync(name)) continue;
		else {
			try {
				await download(url, name);
			} catch (error) {
				console.error(error);
			}
		}
	}
	console.log(`Finished download of search ${search}`)
	return;
}

export async function downloadFavorites(userID, location, relatives) {
	let faves = await getFavorites(userID);
	let folder = join(location, "Favorites", userID);

	!existsSync(folder) && mkdirSync(folder, { recursive: true });

	console.log(`Beginning download of User ${userID}`)
	for (const post of faves.posts) {
		let url = post.file.url;
		let fname = `${post.id}.${post.file.ext}`;
		let name = join(folder, fname);
		if (existsSync(name)) continue;
		else {
			try {
				await download(url, name);
			} catch (error) {
				console.error(error);
			}
		}
	}
	console.log(`Finished download of User ${userID}`)
	return;
}