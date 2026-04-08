import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { randomBytes } from "node:crypto";

const ACCOUNT_ID = "e3cf4aad518c3da535dc6942ad57d20f";
const DB_NAME = "my-emdash-site";
const R2_BUCKET = "my-emdash-media";
const CMS_ORIGIN = "https://my-emdash-site.nick-e3c.workers.dev";
const TMP = resolve(process.cwd(), ".tmp-img2");
mkdirSync(TMP, { recursive: true });

function d1(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --remote --command "${escaped}" --json 2>/dev/null`;
  return JSON.parse(execSync(cmd, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }))[0]?.results || [];
}

function genId() {
  return Date.now().toString(36).toUpperCase().padStart(10, "0") + randomBytes(8).toString("hex").toUpperCase().slice(0, 16);
}

const posts = d1("SELECT id, slug, content FROM ec_posts WHERE content LIKE '%adambuice.com%'");
console.log(`Posts with remaining WP content images: ${posts.length}`);

const urlMap = new Map();
for (const post of posts) {
  const content = typeof post.content === "string" ? JSON.parse(post.content) : post.content;
  for (const block of content) {
    if (block._type === "image" && block.asset?.url?.includes("adambuice.com")) {
      const url = block.asset.url;
      if (!urlMap.has(url)) {
        const id = genId();
        const ext = extname(new URL(url).pathname) || ".jpeg";
        urlMap.set(url, { storageKey: id + ext, mediaId: id });
      }
    }
  }
}

console.log(`URLs to migrate: ${urlMap.size}`);

for (const [url, info] of urlMap) {
  const tmpPath = resolve(TMP, info.storageKey);
  const filename = new URL(url).pathname.split("/").pop();
  process.stdout.write(`  ${filename} ... `);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
    if (!res.ok) { console.log("SKIP"); continue; }
    writeFileSync(tmpPath, Buffer.from(await res.arrayBuffer()));
    execSync(`CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler r2 object put ${R2_BUCKET}/${info.storageKey} --file="${tmpPath}" 2>&1`);
    const mime = url.endsWith(".png") ? "image/png" : "image/jpeg";
    const fn = filename.replace(/'/g, "''");
    d1(`INSERT OR IGNORE INTO media (id,filename,mime_type,size,width,height,alt,storage_key,created_at,status) VALUES ('${info.mediaId}','${fn}','${mime}',0,0,0,'','${info.storageKey}',datetime('now'),'ready')`);
    unlinkSync(tmpPath);
    console.log("OK");
  } catch (e) { console.log("FAIL: " + e.message?.slice(0, 60)); }
}

for (const post of posts) {
  const content = typeof post.content === "string" ? JSON.parse(post.content) : post.content;
  let changed = false;
  for (const block of content) {
    if (block._type === "image" && block.asset?.url?.includes("adambuice.com")) {
      const info = urlMap.get(block.asset.url);
      if (info) {
        block.asset._ref = `${CMS_ORIGIN}/_emdash/api/media/file/${info.storageKey}`;
        block.asset.url = `${CMS_ORIGIN}/_emdash/api/media/file/${info.storageKey}`;
        changed = true;
      }
    }
  }
  if (changed) {
    const nc = JSON.stringify(content).replace(/'/g, "''");
    d1(`UPDATE ec_posts SET content = '${nc}' WHERE id = '${post.id}'`);
    console.log(`Updated: ${post.slug}`);
  }
}

execSync(`rm -rf "${TMP}"`);
console.log("Done!");
