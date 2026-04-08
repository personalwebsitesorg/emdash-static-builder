import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: process.env.PUBLIC_SITE_URL || "https://adambuice.com",
  compressHTML: true,
  build: {
    inlineStylesheets: "always",
  },
});
