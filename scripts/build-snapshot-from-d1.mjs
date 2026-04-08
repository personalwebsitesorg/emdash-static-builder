/**
 * Builds a snapshot directly from D1 (bypasses the CMS export page).
 * Reads all frontend tables, filters sensitive data, writes to R2.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ACCOUNT_ID = "e3cf4aad518c3da535dc6942ad57d20f";
const DB_NAME = "my-emdash-site";
const R2_BUCKET = "my-emdash-media";

function d1query(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --remote --command "${escaped}" --json 2>/dev/null`;
  const out = execSync(cmd, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  return parsed[0]?.results || [];
}

// Tables to include (frontend-only, no sensitive data)
const TABLES = [
  "ec_posts", "ec_pages",
  "_emdash_menus", "_emdash_menu_items",
  "_emdash_widget_areas", "_emdash_widgets",
  "_emdash_bylines", "_emdash_content_bylines",
  "_emdash_seo",
  "taxonomies", "content_taxonomies",
  "media", "options",
];

console.log("Building snapshot from D1...");

const snapshot = { tables: {}, schema: {}, generatedAt: new Date().toISOString() };

for (const table of TABLES) {
  process.stdout.write(`  ${table} ... `);
  try {
    // Get data
    let rows;
    if (table === "ec_posts" || table === "ec_pages") {
      rows = d1query(`SELECT * FROM ${table} WHERE status = 'published' AND deleted_at IS NULL`);
    } else if (table === "options") {
      rows = d1query(`SELECT * FROM ${table} WHERE name LIKE 'site:%'`);
    } else {
      rows = d1query(`SELECT * FROM ${table}`);
    }
    snapshot.tables[table] = rows;

    // Get schema
    const pragma = d1query(`PRAGMA table_info(${table})`);
    snapshot.schema[table] = {
      columns: pragma.map(c => c.name),
      types: Object.fromEntries(pragma.map(c => [c.name, c.type || "TEXT"])),
    };

    console.log(`${rows.length} rows`);
  } catch (e) {
    console.log(`SKIP (${e.message?.slice(0, 60)})`);
  }
}

// Write snapshot locally
const outPath = resolve(process.cwd(), "generated/snapshot.json");
writeFileSync(outPath, JSON.stringify(snapshot));
console.log(`\nSnapshot written to ${outPath}`);

// Also upload to R2 so the normal build flow works
const tmpPath = resolve(process.cwd(), ".tmp-snapshot.json");
writeFileSync(tmpPath, JSON.stringify(snapshot));
try {
  const cmd = `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler r2 object put ${R2_BUCKET}/exports/site-export.json --file="${tmpPath}" --content-type="application/json" 2>&1`;
  execSync(cmd, { encoding: "utf8" });
  console.log("Snapshot uploaded to R2");
  execSync(`rm -f "${tmpPath}"`);
} catch (e) {
  console.log(`R2 upload failed: ${e.message}`);
}

console.log("Done!");
