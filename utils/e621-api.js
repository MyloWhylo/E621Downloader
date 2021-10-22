import fetch from "node-fetch";

import { createRequire } from "module"; // Bring in the ability to create the 'require' method
const require = createRequire(import.meta.url); // construct the require method
const config = require("../config/config.json"); // use the require method

const options = {
	headers: {
		"User-Agent": "E6Grabber/1.2 (by MyloWhylo on e621)",
		"Authorization": new Buffer.from(`${config.username}:${config.api_key}`).toString("base64")
	}
};


export default class E6API {
	#requests = 0;
	#searchSize;
	#pageSize;

	constructor(searchSize = 75, pageSize = 320) {
		this.#searchSize = searchSize;
		this.#pageSize = pageSize;
	}

	async download(post) {
		let url = post.file.url;
		const response = await fetch(url);
		const buffer = await response.buffer();

		return buffer;
	}

	async getPost(postID) {
		let url = `https://e621.net/posts.json?tags=id%3A${postID}`;
		const response = await fetch(url, options);
		const data = await response.json();
		this.#requests++;

		if (data.posts.length == 0 || data.posts[0].id != postID) return -1
		else return data.posts[0];
	}

	async getSearch(query) {
		let limit = this.#searchSize;
		query = query.split(" ?limit:");
		if (query.length > 1) limit = query[1];
		let inTags = query[0];
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

		this.#requests++;
		return data;
	}

	async getPoolPosts(poolID, page = 1) {
		let dataUrl = `https://e621.net/posts.json?tags=pool%3A${poolID}&page=${page}&limit=${this.#pageSize}`;
		const dataQuery = await fetch(dataUrl, options);
		const data = await dataQuery.json();
		this.#requests++;

		let posts = data.posts;

		if (!data.posts[0].pools.includes(parseInt(poolID))) {
			throw new Error("Retrieved pool does not match requested pool!");
		}

		if (posts.length >= this.#pageSize) {
			let newData = await this.getPoolPosts(poolID, page + 1);
			posts = posts.concat(newData);
		}
		return posts;
	}

	async getPoolMetadata(poolID) {
		let poolUrl = `https://e621.net/pools.json?search%5Bid%5D=${poolID}`;
		const poolQuery = await fetch(poolUrl, options);
		const poolMetadata = await poolQuery.json();
		this.#requests++;
		if (poolMetadata[0].id != poolID) {
			throw new Error("Retrieved pool does not match requested pool!");
		}

		return poolMetadata[0];
	}

	async getFavorites(username, page = 1) {
		let url = `https://e621.net/posts.json?tags=fav%3A${username}&page=${page}&limit=${this.#pageSize}`;
		const response = await fetch(url, options);
		const data = await response.json();
		this.#requests++;

		if (data.posts.length === 75) {
			let newData = await this.getFavorites(username, page + 1);
			data.posts = data.posts.concat(newData.posts);
		}
		return data;
	}

	get requests() {
		return this.#requests;
	}
}
