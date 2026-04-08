import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { randomBytes } from "node:crypto";

const ACCOUNT_ID = "e3cf4aad518c3da535dc6942ad57d20f";
const DB_NAME = "my-emdash-site";
const R2_BUCKET = "my-emdash-media";
const CMS_ORIGIN = "https://my-emdash-site.nick-e3c.workers.dev";
const TMP = resolve(process.cwd(), ".tmp-gallery");
mkdirSync(TMP, { recursive: true });

function d1(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --remote --command "${escaped}" --json 2>/dev/null`;
  return JSON.parse(execSync(cmd, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }))[0]?.results || [];
}

function genId() {
  return Date.now().toString(36).toUpperCase().padStart(10, "0") + randomBytes(8).toString("hex").toUpperCase().slice(0, 16);
}

// Recursively find all WP image URLs in any block structure
function findWpUrls(obj, urls) {
  if (!obj || typeof obj !== "object") return;
  if (typeof obj.url === "string" && obj.url.includes("adambuice.com")) {
    urls.add(obj.url);
  }
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) findWpUrls(item, urls);
    } else if (typeof val === "object" && val) {
      findWpUrls(val, urls);
    }
  }
}

// Recursively replace WP URLs in any block structure
function replaceWpUrls(obj, urlMap) {
  if (!obj || typeof obj !== "object") return false;
  let changed = false;
  if (typeof obj.url === "string" && urlMap.has(obj.url)) {
    const info = urlMap.get(obj.url);
    obj.url = `${CMS_ORIGIN}/_emdash/api/media/file/${info.storageKey}`;
    if (obj._ref) obj._ref = obj.url;
    changed = true;
  }
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) { if (replaceWpUrls(item, urlMap)) changed = true; }
    } else if (typeof val === "object" && val) {
      if (replaceWpUrls(val, urlMap)) changed = true;
    }
  }
  return changed;
}

// Get all posts with WP content
const posts = d1("SELECT id, slug, content FROM ec_posts WHERE content LIKE '%adambuice.com/wp-content%'");
console.log(`Posts with WP content URLs: ${posts.length}`);

// Collect all unique WP image URLs
const allUrls = new Set();
for (const post of posts) {
  const content = typeof post.content === "string" ? JSON.parse(post.content) : post.content;
  for (const block of content) {
    findWpUrls(block, allUrls);
  }
}
console.log(`Unique WP URLs found: ${allUrls.size}`);

// Build URL map
const urlMap = new Map();
for (const url of allUrls) {
  const id = genId();
  const ext = extname(new URL(url).pathname) || ".jpeg";
  urlMap.set(url, { storageKey: id + ext, mediaId: id });
}

// Download and upload
let ok = 0, fail = 0;
for (const [url, info] of urlMap) {
  const tmpPath = resolve(TMP, info.storageKey);
  const filename = new URL(url).pathname.split("/").pop();
  process.stdout.write(`  ${filename} ... `);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
    if (!res.ok) { console.log("SKIP"); fail++; continue; }
    writeFileSync(tmpPath, Buffer.from(await res.arrayBuffer()));
    execSync(`CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler r2 object put ${R2_BUCKET}/${info.storageKey} --file="${tmpPath}" 2>&1`);
    const mime = url.endsWith(".png") ? "image/png" : "image/jpeg";
    const fn = filename.replace(/'/g, "''");
    d1(`INSERT OR IGNORE INTO media (id,filename,mime_type,size,width,height,alt,storage_key,created_at,status) VALUES ('${info.mediaId}','${fn}','${mime}',0,0,0,'','${info.storageKey}',datetime('now'),'ready')`);
    unlinkSync(tmpPath);
    console.log("OK");
    ok++;
  } catch (e) { console.log("FAIL"); fail++; }
}
console.log(`\nUploaded: ${ok}, Failed: ${fail}`);

// Update content
let updated = 0;
for (const post of posts) {
  const content = typeof post.content === "string" ? JSON.parse(post.content) : post.content;
  let changed = false;
  for (const block of content) {
    if (replaceWpUrls(block, urlMap)) changed = true;
  }
  if (changed) {
    const nc = JSON.stringify(content).replace(/'/g, "''");
    d1(`UPDATE ec_posts SET content = '${nc}' WHERE id = '${post.id}'`);
    console.log(`Updated: ${post.slug}`);
    updated++;
  }
}
console.log(`Updated ${updated} posts`);

execSync(`rm -rf "${TMP}"`);
console.log("Done!");
