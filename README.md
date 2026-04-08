# emdash-static-builder

Astro static site generator that consumes an emdash export JSON from R2 and builds a fully static website. Zero JavaScript on the client (except a tiny nav toggle), all CSS inlined, self-hosted fonts.

## Setup

```bash
npm install
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SNAPSHOT_URL` | Yes | Public R2 URL to `exports/site-export.json` |
| `THEME` | No | Theme variant: `professional`, `editorial`, `minimal`, `bold` (default: `professional`) |
| `R2_PUBLIC_URL` | No | Public R2 base URL for media files (rewrites emdash CMS media URLs) |
| `PUBLIC_SITE_URL` | No | Canonical site URL (default: `https://adambuice.com`) |

## Build

```bash
# Fetch snapshot from R2 + download fonts + build static site
SNAPSHOT_URL=https://pub-xxx.r2.dev/exports/site-export.json THEME=professional npm run build

# Preview locally
npm run preview
```

## Deploy to Cloudflare Workers

```bash
npm run deploy
```

## Themes

Switch themes by setting the `THEME` env var. Each theme completely changes the visual style:

- **professional** — clean business look with Poppins font, blue accents
- **editorial** — warm serif typography, literary magazine feel
- **minimal** — Inter font, monochrome, maximum whitespace
- **bold** — dark background, Space Grotesk, purple accents

## What gets generated

- `/` — Home page with 6 recent posts
- `/posts` — Blog listing with category filter and sidebar
- `/posts/[slug]` — Individual post with sidebar
- `/category/[slug]` — Posts filtered by category
- `/tag/[slug]` — Posts filtered by tag
- `/[slug]` — Static pages (about, contact, etc.)
- `/sitemap.xml` — Auto-generated sitemap
- `/robots.txt` — Robots file
- `/404` — Custom 404 page

## Performance

- All CSS inlined (no render-blocking stylesheets)
- Fonts self-hosted and preloaded (no Google Fonts requests)
- Images lazy-loaded with proper width/height (no CLS)
- Zero client-side JavaScript (except mobile nav toggle)
- HTML compressed
- Skip-to-content link for accessibility
