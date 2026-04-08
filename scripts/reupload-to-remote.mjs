/**
 * Re-uploads locally-stored R2 objects to remote R2.
 * The initial migration uploaded to local R2 (missing --remote flag).
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ACCOUNT_ID = "e3cf4aad518c3da535dc6942ad57d20f";
const R2_BUCKET = "my-emdash-media";
const DB_NAME = "my-emdash-site";
const TMP = resolve(process.cwd(), ".tmp-reupload");
mkdirSync(TMP, { recursive: true });

function d1(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${DB_NAME} --remote --command "${escaped}" --json 2>/dev/null`;
  return JSON.parse(execSync(cmd, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }))[0]?.results || [];
}

// Get all migrated media keys (the ones we added)
const rows = d1("SELECT storage_key, filename FROM media WHERE id LIKE '00MN%'");
console.log(`Found ${rows.length} migrated media records to re-upload`);

let ok = 0, fail = 0;
for (const row of rows) {
  const key = row.storage_key;
  const tmpPath = resolve(TMP, key);
  process.stdout.write(`  ${row.filename} ... `);

  try {
    // Download from local R2
    execSync(`CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler r2 object get ${R2_BUCKET}/${key} --file="${tmpPath}" 2>&1`);

    // Upload to remote R2
    execSync(`CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler r2 object put ${R2_BUCKET}/${key} --file="${tmpPath}" --remote 2>&1`);

    unlinkSync(tmpPath);
    console.log("OK");
    ok++;
  } catch (e) {
    console.log("FAIL");
    fail++;
  }
}

execSync(`rm -rf "${TMP}"`);
console.log(`\nDone! Uploaded: ${ok}, Failed: ${fail}`);
