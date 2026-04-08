/**
 * Fetches the site snapshot from public R2 and writes it to generated/.
 * Also downloads and self-hosts Google Fonts for the active theme.
 *
 * Env vars:
 *   SNAPSHOT_URL  — full URL to the R2 JSON (required)
 *   THEME         — theme variant name (default: "professional")
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const SNAPSHOT_URL = process.env.SNAPSHOT_URL;
const THEME = process.env.THEME || "professional";

const THEME_FONTS = {
  professional: "Poppins:wght@300;400;500;600;700",
  editorial: "Playfair+Display:wght@400;500;600;700&family=Source+Sans+3:wght@300;400;600;700",
  minimal: "Inter:wght@400;500;600;700;800",
  bold: "Space+Grotesk:wght@400;500;600;700",
  luxe: "DM+Serif+Display&family=DM+Sans:wght@300;400;500;700",
  vivid: "Sora:wght@300;400;500;600;700",
  journal: "Merriweather:wght@300;400;700;900&family=Inter:wght@400;500;600;700",
  slate: "Outfit:wght@300;400;500;600;700",
};

const outDir = resolve(process.cwd(), "generated");
const fontDir = resolve(process.cwd(), "public/fonts");

mkdirSync(outDir, { recursive: true });
mkdirSync(fontDir, { recursive: true });

// ── 1. Fetch snapshot ──
let snapshot;
if (SNAPSHOT_URL) {
  console.log(`Fetching snapshot from ${SNAPSHOT_URL}`);
  const res = await fetch(SNAPSHOT_URL);
  if (!res.ok) throw new Error(`Failed to fetch snapshot: ${res.status} ${res.statusText}`);
  snapshot = await res.json();
} else {
  // Fallback: check for local file
  const localPath = resolve(process.cwd(), "generated/snapshot.json");
  if (existsSync(localPath)) {
    console.log("Using existing local snapshot");
    snapshot = JSON.parse(readFileSync(localPath, "utf8"));
  } else {
    console.error("Error: Set SNAPSHOT_URL env var to the public R2 URL for the export JSON.");
    console.error("Example: SNAPSHOT_URL=https://pub-abc123.r2.dev/exports/site-export.json");
    process.exit(1);
  }
}

writeFileSync(resolve(outDir, "snapshot.json"), JSON.stringify(snapshot));
console.log(`Snapshot written (${Object.keys(snapshot.tables).length} tables)`);

// ── 2. Download and self-host fonts ──
const fontQuery = THEME_FONTS[THEME] || THEME_FONTS.professional;
const googleUrl = `https://fonts.googleapis.com/css2?family=${fontQuery}&display=swap`;

console.log(`Fetching fonts for theme: ${THEME}`);
const cssRes = await fetch(googleUrl, {
  headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0" },
});

if (!cssRes.ok) {
  console.warn(`Font fetch failed (${cssRes.status}), using system fonts`);
  writeFileSync(resolve(outDir, "fonts.css"), "/* font fetch failed — system fonts only */");
  writeFileSync(resolve(outDir, "font-preloads.json"), "[]");
} else {
  let css = await cssRes.text();

  // Filter to latin only
  const blocks = css.split(/(?=\/\*)/);
  const latinBlocks = blocks.filter(
    (b) => !b.includes("/*") || b.includes("latin */") || (!b.includes("latin-ext") && !b.includes("cyrillic") && !b.includes("greek") && !b.includes("vietnamese"))
  );
  css = latinBlocks.join("");

  // Download each woff2 and replace URL
  const preloads = [];
  const urlPattern = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g;
  const urls = [...css.matchAll(urlPattern)].map((m) => m[1]);
  const unique = [...new Set(urls)];

  for (const url of unique) {
    const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
    const filename = `${THEME}-${hash}.woff2`;
    const outPath = resolve(fontDir, filename);

    if (!existsSync(outPath)) {
      const fontRes = await fetch(url);
      if (fontRes.ok) {
        const buf = Buffer.from(await fontRes.arrayBuffer());
        writeFileSync(outPath, buf);
      }
    }

    css = css.replaceAll(url, `/fonts/${filename}`);

    // Preload normal (non-italic) weights
    if (!css.includes(`font-style: italic`) || css.indexOf(`/fonts/${filename}`) < css.indexOf("font-style: italic")) {
      preloads.push(`/fonts/${filename}`);
    }
  }

  writeFileSync(resolve(outDir, "fonts.css"), css);
  writeFileSync(resolve(outDir, "font-preloads.json"), JSON.stringify([...new Set(preloads)]));
  console.log(`Fonts: ${unique.length} files downloaded, ${preloads.length} preloads`);
}

// ── 3. Write theme config ──
writeFileSync(resolve(outDir, "theme.json"), JSON.stringify({ theme: THEME }));
console.log("Done.");
