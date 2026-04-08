/**
 * Migrates WordPress images to R2 and updates D1 database.
 *
 * 1. Finds all posts with WordPress image URLs (featured_image + content)
 * 2. Downloads each image
 * 3. Uploads to R2 via wrangler
 * 4. Updates D1 records to point to R2
 *
 * Requires: wrangler CLI authenticated with access to Nick's account.
 *
 * Usage:
 *   node scripts/migrate-wp-images.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { resolve, extname } from "node:path";
import { randomBytes } from "node:crypto";

const ACCOUNT_ID = "e3cf4aad518c3da535dc6942ad57d20f";
const DB_NAME = "my-emdash-site";
const R2_BUCKET = "my-emdash-media";
const CMS_ORIGIN = "https://my-emdash-site.nick-e3c.workers.dev";
const TMP_DIR = resolve(process.cwd(), ".tmp-images");

mkdirSync(TMP_DIR, { recursive: true });

function d1(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --remote --command "${escaped}" --json 2>/dev/null`;
  const out = execSync(cmd, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  return parsed[0]?.results || [];
}

function r2upload(localPath, key) {
  const cmd = `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler r2 object put ${R2_BUCKET}/${key} --file="${localPath}" 2>&1`;
  execSync(cmd, { encoding: "utf8" });
}

function generateId() {
  // Simple ULID-like ID
  const ts = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const rand = randomBytes(8).toString("hex").toUpperCase().slice(0, 16);
  return ts + rand;
}

function getMimeType(url) {
  const ext = extname(new URL(url).pathname).toLowerCase();
  const map = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
    ".gif": "image/gif", ".svg": "image/svg+xml",
  };
  return map[ext] || "image/jpeg";
}

function getExt(url) {
  const ext = extname(new URL(url).pathname).toLowerCase();
  return ext || ".jpg";
}

async function downloadImage(url, dest) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; image-migrator/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) return false; // skip tiny/broken files
  writeFileSync(dest, buf);
  return true;
}

// ── 1. Get all posts with WordPress featured images ──
console.log("Finding posts with WordPress images...");
const wpPosts = d1(
  "SELECT id, slug, featured_image FROM ec_posts WHERE featured_image LIKE '%adambuice.com%'"
);
console.log(`Found ${wpPosts.length} posts with WordPress featured images`);

// ── 2. Get all posts with WordPress images in content ──
const wpContentPosts = d1(
  "SELECT id, slug, content FROM ec_posts WHERE content LIKE '%adambuice.com%'"
);
console.log(`Found ${wpContentPosts.length} posts with WordPress images in content`);

// ── 3. Collect all unique WordPress URLs ──
const urlMap = new Map(); // wpUrl → { storageKey, mediaId }

// From featured images
for (const post of wpPosts) {
  const fi = JSON.parse(post.featured_image);
  if (fi.src && fi.src.includes("adambuice.com")) {
    if (!urlMap.has(fi.src)) {
      const id = generateId();
      const ext = getExt(fi.src);
      urlMap.set(fi.src, { storageKey: `${id}${ext}`, mediaId: id });
    }
  }
}

// From content blocks
for (const post of wpContentPosts) {
  const content = typeof post.content === "string" ? JSON.parse(post.content) : post.content;
  for (const block of content) {
    if (block._type === "image" && block.asset?.url?.includes("adambuice.com")) {
      const url = block.asset.url;
      if (!urlMap.has(url)) {
        const id = generateId();
        const ext = getExt(url);
        urlMap.set(url, { storageKey: `${id}${ext}`, mediaId: id });
      }
    }
  }
}

console.log(`\nUnique WordPress image URLs to migrate: ${urlMap.size}`);

// ── 4. Download and upload each image ──
let success = 0;
let failed = 0;

for (const [url, info] of urlMap) {
  const tmpPath = resolve(TMP_DIR, info.storageKey);
  const filename = new URL(url).pathname.split("/").pop() || "image.jpg";

  process.stdout.write(`  ${filename} ... `);

  try {
    const ok = await downloadImage(url, tmpPath);
    if (!ok) {
      console.log("SKIP (download failed)");
      failed++;
      continue;
    }

    // Upload to R2
    r2upload(tmpPath, info.storageKey);

    // Create media record in D1
    const mime = getMimeType(url);
    const escapedFilename = filename.replace(/'/g, "''");
    d1(`INSERT OR IGNORE INTO media (id, filename, mime_type, size, width, height, alt, storage_key, created_at, status) VALUES ('${info.mediaId}', '${escapedFilename}', '${mime}', 0, 0, 0, '', '${info.storageKey}', datetime('now'), 'ready')`);

    // Clean up temp file
    if (existsSync(tmpPath)) unlinkSync(tmpPath);

    console.log("OK");
    success++;
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    failed++;
  }
}

console.log(`\nUploaded: ${success}, Failed: ${failed}`);

// ── 5. Update featured_image in posts ──
console.log("\nUpdating featured_image references...");
let updatedFi = 0;

for (const post of wpPosts) {
  const fi = JSON.parse(post.featured_image);
  if (!fi.src || !fi.src.includes("adambuice.com")) continue;

  const info = urlMap.get(fi.src);
  if (!info) continue;

  // Build new featured_image JSON pointing to R2 via CMS media API
  const newFi = {
    provider: "local",
    id: info.storageKey.replace(/\.[^.]+$/, ""),
    src: `${CMS_ORIGIN}/_emdash/api/media/file/${info.storageKey}`,
    alt: fi.alt || "",
    width: fi.width || 0,
    height: fi.height || 0,
    mimeType: getMimeType(fi.src),
    filename: new URL(fi.src).pathname.split("/").pop() || "image.jpg",
    meta: { storageKey: info.storageKey },
  };

  const newFiJson = JSON.stringify(newFi).replace(/'/g, "''");
  d1(`UPDATE ec_posts SET featured_image = '${newFiJson}' WHERE id = '${post.id}'`);
  updatedFi++;
}
console.log(`Updated ${updatedFi} featured images`);

// ── 6. Update content blocks ──
console.log("Updating content block image references...");
let updatedContent = 0;

for (const post of wpContentPosts) {
  const content = typeof post.content === "string" ? JSON.parse(post.content) : post.content;
  let changed = false;

  for (const block of content) {
    if (block._type === "image" && block.asset?.url?.includes("adambuice.com")) {
      const info = urlMap.get(block.asset.url);
      if (info) {
        const newUrl = `${CMS_ORIGIN}/_emdash/api/media/file/${info.storageKey}`;
        block.asset._ref = newUrl;
        block.asset.url = newUrl;
        changed = true;
      }
    }
  }

  if (changed) {
    const newContent = JSON.stringify(content).replace(/'/g, "''");
    d1(`UPDATE ec_posts SET content = '${newContent}' WHERE id = '${post.id}'`);
    updatedContent++;
  }
}
console.log(`Updated ${updatedContent} post content blocks`);

// ── Cleanup ──
try { execSync(`rm -rf "${TMP_DIR}"`); } catch {}

console.log("\nDone! Now go to /_emdash/export and click Export to R2 to regenerate the snapshot.");
