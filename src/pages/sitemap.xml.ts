import type { APIRoute } from "astro";
import { getPosts, getPages, getAllCategories, getAllTags } from "../lib/snapshot";

export const GET: APIRoute = ({ site }) => {
  const baseUrl = site?.toString().replace(/\/$/, "") || "https://adambuice.com";
  const posts = getPosts();
  const pages = getPages();
  const categories = getAllCategories();
  const tags = getAllTags();

  const reserved = new Set(["home", "blog", "posts", "articles"]);

  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: baseUrl, priority: "1.0" },
    { loc: `${baseUrl}/posts`, priority: "0.9" },
  ];

  for (const page of pages) {
    if (reserved.has(page.slug)) continue;
    urls.push({
      loc: `${baseUrl}/${page.slug}`,
      lastmod: page.updatedAt || page.publishedAt || undefined,
      priority: "0.7",
    });
  }

  for (const post of posts) {
    urls.push({
      loc: `${baseUrl}/posts/${post.slug}`,
      lastmod: post.updatedAt || post.publishedAt || undefined,
      priority: "0.8",
    });
  }

  for (const cat of categories) {
    urls.push({ loc: `${baseUrl}/category/${cat.slug}`, priority: "0.6" });
  }

  for (const tag of tags) {
    urls.push({ loc: `${baseUrl}/tag/${tag.slug}`, priority: "0.5" });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
