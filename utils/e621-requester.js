import fetch from "node-fetch";
import { writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

const options = {
  headers: { "User-Agent": "E6Grabber/1.0 (by MyloWhylo on e621)" },
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
  return data;
}

export async function getPool(poolID) {
  let url = `https://e621.net/pools.json?search%5Bid%5D=${poolID}`;
  const response = await fetch(url, options);
  const data = await response.json();
  return data;
}

export async function getFavorites(userID) {
  let url = `https://e621.net/favorites.json?user_id=${userID}`;
  const response = await fetch(url, options);
  const data = await response.json();
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

export async function downloadFavorites(userID, location) {
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
