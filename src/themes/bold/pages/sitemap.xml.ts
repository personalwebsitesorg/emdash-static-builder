import type { APIRoute } from "astro";
import { getPosts, getPages, getAllCategories, getAllTags } from "@shared/snapshot";
export const GET: APIRoute = ({ site }) => {
  const base = site?.toString().replace(/\/$/, "") || "";
  const reserved = new Set(["home", "blog", "posts", "articles"]);
  const urls = [
    { loc: base, priority: "1.0" },
    { loc: `${base}/posts`, priority: "0.9" },
    ...getPages().filter((p) => !reserved.has(p.slug)).map((p) => ({ loc: `${base}/${p.slug}`, lastmod: p.updatedAt || p.publishedAt, priority: "0.7" })),
    ...getPosts().map((p) => ({ loc: `${base}/posts/${p.slug}`, lastmod: p.updatedAt || p.publishedAt, priority: "0.8" })),
    ...getAllCategories().map((c) => ({ loc: `${base}/category/${c.slug}`, priority: "0.6" })),
    ...getAllTags().map((t) => ({ loc: `${base}/tag/${t.slug}`, priority: "0.5" })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}\n    <priority>${u.priority}</priority>\n  </url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
