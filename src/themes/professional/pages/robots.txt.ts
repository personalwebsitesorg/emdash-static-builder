import type { APIRoute } from "astro";
export const GET: APIRoute = ({ site }) => {
  const base = site?.toString().replace(/\/$/, "") || "";
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
