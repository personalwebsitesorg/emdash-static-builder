import { defineConfig } from "astro/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const theme = process.env.THEME || "professional";

export default defineConfig({
  output: "static",
  site: process.env.PUBLIC_SITE_URL || "https://adambuice.com",
  srcDir: `./src/themes/${theme}`,
  compressHTML: true,
  build: {
    inlineStylesheets: "always",
  },
  vite: {
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@generated": resolve("generated"),
      },
    },
  },
  integrations: [
    {
      name: "cache-headers",
      hooks: {
        "astro:build:done": ({ dir }) => {
          writeFileSync(
            resolve(dir.pathname, "_headers"),
            [
              "/fonts/*",
              "  Cache-Control: public, max-age=31536000, immutable",
              "",
              "/*.html",
              "  Cache-Control: public, max-age=3600, stale-while-revalidate=86400",
              "",
              "/*/index.html",
              "  Cache-Control: public, max-age=3600, stale-while-revalidate=86400",
              "",
              "/sitemap.xml",
              "  Cache-Control: public, max-age=86400",
              "/robots.txt",
              "  Cache-Control: public, max-age=86400",
            ].join("\n"),
          );
        },
      },
    },
  ],
});
