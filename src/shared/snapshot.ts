/**
 * Data layer: reads the pre-fetched snapshot and exposes typed helpers.
 * All data is loaded once at build time and cached in memory.
 */
import snapshotRaw from "../../generated/snapshot.json";
import themeConfig from "../../generated/theme.json";

// ── Raw types matching the emdash export schema ──

interface RawRow {
  [key: string]: unknown;
}

interface Snapshot {
  tables: Record<string, RawRow[]>;
  schema: Record<string, { columns: string[]; types?: Record<string, string> }>;
  generatedAt: string;
}

// ── Public types ──

export interface Post {
  id: string;
  slug: string;
  title: string;
  content: unknown[];
  excerpt: string;
  featuredImage: MediaImage | null;
  publishedAt: string | null;
  updatedAt: string | null;
  primaryBylineId: string | null;
  categories: Taxonomy[];
  tags: Taxonomy[];
  bylines: Byline[];
  readingTime: number;
  seo: SeoMeta | null;
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  content: unknown[];
  excerpt: string;
  featuredImage: MediaImage | null;
  publishedAt: string | null;
  updatedAt: string | null;
  seo: SeoMeta | null;
}

export interface MediaImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  filename: string;
}

export interface SeoMeta {
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  canonical: string | null;
  noIndex: boolean;
}

export interface Taxonomy {
  id: string;
  name: string;
  slug: string;
  label: string;
  description: string | null;
  parentId: string | null;
  count: number;
}

export interface Byline {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  websiteUrl: string | null;
  isGuest: boolean;
  role: string | null;
}

export interface MenuItem {
  id: string;
  label: string;
  url: string;
  target: string | null;
  parentId: string | null;
  cssClasses: string | null;
  sortOrder: number;
  children: MenuItem[];
}

export interface SiteSettings {
  title: string;
  tagline: string;
  logo: MediaImage | null;
  favicon: MediaImage | null;
  url: string;
  dateFormat: string;
  postsPerPage: number;
  titleSeparator: string;
  defaultOgImage: string | null;
  social: { twitter: string; github: string; facebook: string; instagram: string; linkedin: string; youtube: string };
  googleVerification: string;
  bingVerification: string;
}

export interface Widget {
  id: string;
  areaId: string;
  type: string;
  title: string;
  content: unknown[];
  menuName: string | null;
  componentId: string | null;
  componentProps: Record<string, unknown> | null;
  sortOrder: number;
}

export interface Section {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content: unknown[];
  keywords: string | null;
}

export interface MediaItem {
  id: string;
  filename: string;
  mimeType: string;
  src: string;
  alt: string;
  caption: string | null;
  width: number;
  height: number;
  blurhash: string | null;
  dominantColor: string | null;
}

// ── Singleton ──

const snapshot = snapshotRaw as unknown as Snapshot;

function table<T = RawRow>(name: string): T[] {
  return (snapshot.tables[name] || []) as T[];
}

// ── Media URL rewriting ──

const R2_PUBLIC_URL = import.meta.env.R2_PUBLIC_URL || "";

// ── Media map (cached) ──

let _mediaMap: Map<string, MediaItem> | null = null;
function getMediaMap(): Map<string, MediaItem> {
  if (_mediaMap) return _mediaMap;
  _mediaMap = new Map();
  for (const row of table("media")) {
    const r = row as any;
    const src = R2_PUBLIC_URL && r.storage_key ? `${R2_PUBLIC_URL}/${r.storage_key}` : "";
    _mediaMap.set(r.id, {
      id: r.id,
      filename: r.filename || "",
      mimeType: r.mime_type || "",
      src,
      alt: r.alt || "",
      caption: r.caption || null,
      width: r.width || 0,
      height: r.height || 0,
      blurhash: r.blurhash || null,
      dominantColor: r.dominant_color || null,
    });
  }
  return _mediaMap;
}

function rewriteMediaUrl(url: string): string {
  if (!url) return url;
  // Rewrite emdash CMS media URLs to R2 public URL
  const emdashPattern = /https?:\/\/[^/]+\/_emdash\/api\/media\/file\/(.+)/;
  const match = url.match(emdashPattern);
  if (match && R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${match[1]}`;
  }
  return url;
}

function parseFeaturedImage(raw: unknown): MediaImage | null {
  if (!raw) return null;
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || typeof data !== "object") return null;
  const src = rewriteMediaUrl(data.src || "");
  return {
    src,
    alt: data.alt || "",
    width: data.width || 0,
    height: data.height || 0,
    filename: data.filename || "",
  };
}

// ── Reading time ──

function estimateReadingTime(content: unknown[]): number {
  if (!Array.isArray(content)) return 1;
  let words = 0;
  for (const block of content) {
    const b = block as any;
    if (b.children) {
      for (const child of b.children) {
        if (typeof child.text === "string") {
          words += child.text.split(/\s+/).filter(Boolean).length;
        }
      }
    }
  }
  return Math.max(1, Math.ceil(words / 238));
}

// ── Taxonomy helpers ──

const allTaxonomies = table("taxonomies");
const contentTaxonomies = table("content_taxonomies");
const allBylines = table("_emdash_bylines");
const contentBylines = table("_emdash_content_bylines");

// ── SEO lookup ──

const seoEntries = table("_emdash_seo");

function getSeoForEntry(collection: string, entryId: string): SeoMeta | null {
  const entry = seoEntries.find(
    (s: any) => s.collection === collection && s.entry_id === entryId,
  ) as any;
  if (!entry) return null;
  return {
    metaTitle: entry.meta_title || null,
    metaDescription: entry.meta_description || null,
    ogImage: entry.og_image ? rewriteMediaUrl(entry.og_image) : null,
    canonical: entry.canonical || null,
    noIndex: Boolean(entry.no_index),
  };
}

function getTaxonomiesForContent(contentId: string, type: string): Taxonomy[] {
  const taxIds = contentTaxonomies
    .filter((ct: any) => ct.entry_id === contentId)
    .map((ct: any) => ct.taxonomy_id);

  return allTaxonomies
    .filter((t: any) => taxIds.includes(t.id) && t.name === type)
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      label: t.label,
      description: t.description || null,
      parentId: t.parent_id || null,
      count: 0,
    }));
}

function getBylinesForContent(contentId: string): Byline[] {
  const links = contentBylines
    .filter((cb: any) => cb.content_id === contentId)
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

  const mediaMap = getMediaMap();
  return links.map((link: any) => {
    const byline = allBylines.find((b: any) => b.id === link.byline_id) as any;
    const avatarId = byline?.avatar_media_id;
    const avatarMedia = avatarId ? mediaMap.get(avatarId) : null;
    return {
      id: byline?.id || link.byline_id,
      slug: byline?.slug || "",
      displayName: byline?.display_name || "Unknown",
      bio: byline?.bio || null,
      avatarUrl: avatarMedia?.src || null,
      websiteUrl: byline?.website_url || null,
      isGuest: Boolean(byline?.is_guest),
      role: link.role_label || null,
    };
  });
}

// ── Content parsing ──

function parseContent(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ── Public API ──

export function getPosts(): Post[] {
  return table("ec_posts")
    .filter((r: any) => r.status === "published")
    .sort((a: any, b: any) => {
      const da = a.published_at || a.created_at || "";
      const db = b.published_at || b.created_at || "";
      return db.localeCompare(da);
    })
    .map((r: any) => {
      const content = parseContent(r.content);
      return {
        id: r.id,
        slug: r.slug,
        title: r.title || "Untitled",
        content,
        excerpt: r.excerpt || "",
        featuredImage: parseFeaturedImage(r.featured_image),
        publishedAt: r.published_at || null,
        updatedAt: r.updated_at || null,
        primaryBylineId: r.primary_byline_id || null,
        categories: getTaxonomiesForContent(r.id, "category"),
        tags: getTaxonomiesForContent(r.id, "tag"),
        bylines: getBylinesForContent(r.id),
        readingTime: estimateReadingTime(content),
        seo: getSeoForEntry("posts", r.id),
      };
    });
}

export function getPages(): Page[] {
  return table("ec_pages")
    .filter((r: any) => r.status === "published")
    .map((r: any) => ({
      id: r.id,
      slug: r.slug,
      title: r.title || "Untitled",
      content: parseContent(r.content),
      excerpt: r.excerpt || "",
      featuredImage: parseFeaturedImage(r.featured_image),
      publishedAt: r.published_at || null,
      updatedAt: r.updated_at || null,
      seo: getSeoForEntry("pages", r.id),
    }));
}

export function getPageBySlug(slug: string): Page | undefined {
  return getPages().find((p) => p.slug === slug);
}

export function getPostBySlug(slug: string): Post | undefined {
  return getPosts().find((p) => p.slug === slug);
}

/** Normalize CMS page URLs: /pages/about → /about */
function normalizeMenuUrl(url: string): string {
  if (url.startsWith("/pages/")) {
    return "/" + url.slice("/pages/".length);
  }
  return url;
}

export function getMenuItems(): MenuItem[] {
  const flat = table("_emdash_menu_items")
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((r: any) => ({
      id: r.id,
      label: r.label || "",
      url: normalizeMenuUrl(r.custom_url || "/"),
      target: r.target || null,
      parentId: r.parent_id || null,
      cssClasses: r.css_classes || null,
      sortOrder: r.sort_order || 0,
      children: [] as MenuItem[],
    }));

  // Build tree: nest children under parents
  const map = new Map(flat.map((item) => [item.id, item]));
  const roots: MenuItem[] = [];
  for (const item of flat) {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }
  return roots;
}

export function getSiteSettings(): SiteSettings {
  const options = table("options");
  const get = (key: string): string => {
    const opt = options.find((o: any) => o.name === key) as any;
    let val = opt?.value || "";
    if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
      try { val = JSON.parse(val); } catch {}
    }
    return val;
  };
  const getMedia = (key: string): MediaImage | null => {
    const mediaId = get(key);
    if (!mediaId) return null;
    const m = getMediaMap().get(mediaId);
    return m ? { src: m.src, alt: m.alt, width: m.width, height: m.height, filename: m.filename } : null;
  };

  return {
    title: get("site:title") || "My Site",
    tagline: get("site:tagline") || "",
    logo: getMedia("site:logo"),
    favicon: getMedia("site:favicon"),
    url: get("site:url") || "",
    dateFormat: get("site:dateFormat") || "MMMM d, yyyy",
    postsPerPage: parseInt(get("site:postsPerPage"), 10) || 10,
    titleSeparator: get("site:titleSeparator") || " | ",
    defaultOgImage: get("site:defaultOgImage") ? rewriteMediaUrl(get("site:defaultOgImage")) : null,
    social: {
      twitter: get("site:twitter") || "",
      github: get("site:github") || "",
      facebook: get("site:facebook") || "",
      instagram: get("site:instagram") || "",
      linkedin: get("site:linkedin") || "",
      youtube: get("site:youtube") || "",
    },
    googleVerification: get("site:googleVerification") || "",
    bingVerification: get("site:bingVerification") || "",
  };
}

export function getMedia(): Map<string, MediaItem> {
  return getMediaMap();
}

export function getWidgets(areaName: string): Widget[] {
  const areas = table("_emdash_widget_areas");
  const area = areas.find((a: any) => a.name === areaName) as any;
  if (!area) return [];
  return table("_emdash_widgets")
    .filter((w: any) => w.area_id === area.id)
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((w: any) => ({
      id: w.id,
      areaId: w.area_id,
      type: w.type || "",
      title: w.title || "",
      content: parseContent(w.content),
      menuName: w.menu_name || null,
      componentId: w.component_id || null,
      componentProps: w.component_props ? (typeof w.component_props === "string" ? JSON.parse(w.component_props) : w.component_props) : null,
      sortOrder: w.sort_order || 0,
    }));
}

export function getSections(): Section[] {
  return table("_emdash_sections").map((s: any) => ({
    id: s.id,
    slug: s.slug || "",
    title: s.title || "",
    description: s.description || null,
    content: parseContent(s.content),
    keywords: s.keywords || null,
  }));
}

export function getSectionBySlug(slug: string): Section | undefined {
  return getSections().find((s) => s.slug === slug);
}

function mapTaxonomy(t: any): Taxonomy {
  return { id: t.id, name: t.name, slug: t.slug, label: t.label, description: t.description || null, parentId: t.parent_id || null, count: 0 };
}

export function getAllCategories(): Taxonomy[] {
  return allTaxonomies.filter((t: any) => t.name === "category").map(mapTaxonomy);
}

export function getAllTags(): Taxonomy[] {
  return allTaxonomies.filter((t: any) => t.name === "tag").map(mapTaxonomy);
}

export function getPostsByCategory(categorySlug: string): Post[] {
  return getPosts().filter((p) => p.categories.some((c) => c.slug === categorySlug));
}

export function getPostsByTag(tagSlug: string): Post[] {
  return getPosts().filter((p) => p.tags.some((t) => t.slug === tagSlug));
}

/** Get all bylines (authors) */
export function getAllBylines(): Byline[] {
  const mediaMap = getMediaMap();
  return allBylines.map((b: any) => {
    const avatarMedia = b.avatar_media_id ? mediaMap.get(b.avatar_media_id) : null;
    return {
      id: b.id,
      slug: b.slug || "",
      displayName: b.display_name || "",
      bio: b.bio || null,
      avatarUrl: avatarMedia?.src || null,
      websiteUrl: b.website_url || null,
      isGuest: Boolean(b.is_guest),
      role: null,
    };
  });
}

export function getBylineBySlug(slug: string): Byline | undefined {
  return getAllBylines().find((b) => b.slug === slug);
}

/** Get posts by a specific byline */
export function getPostsByByline(bylineId: string): Post[] {
  return getPosts().filter((p) => p.bylines.some((b) => b.id === bylineId));
}

export function getTheme(): string {
  return themeConfig.theme || "professional";
}

export function getGeneratedAt(): string {
  return snapshot.generatedAt || "";
}

/** Generate RSS feed XML */
export function generateRssFeed(siteUrl: string): string {
  const settings = getSiteSettings();
  const posts = getPosts().slice(0, 20);
  const items = posts.map((p) => {
    const link = `${siteUrl}/posts/${p.slug}`;
    const pubDate = p.publishedAt ? new Date(p.publishedAt).toUTCString() : "";
    return `    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${link}</link>
      <guid>${link}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
      ${p.excerpt ? `<description><![CDATA[${p.excerpt}]]></description>` : ""}
      ${p.bylines[0] ? `<author>${p.bylines[0].displayName}</author>` : ""}
      ${p.categories.map((c) => `<category>${c.label}</category>`).join("\n      ")}
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${settings.title}</title>
    <link>${siteUrl}</link>
    <description>${settings.tagline}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
${items.join("\n")}
  </channel>
</rss>`;
}
