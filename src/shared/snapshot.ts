/**
 * Data layer: reads the pre-fetched snapshot and exposes typed helpers.
 * All data is loaded once at build time and cached in memory.
 */
import snapshotRaw from "../../generated/snapshot.json" with { type: "json" };
import themeConfig from "../../generated/theme.json" with { type: "json" };

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

const R2_PUBLIC_URL = (typeof import.meta.env !== 'undefined' ? import.meta.env.R2_PUBLIC_URL : process.env.R2_PUBLIC_URL) || "";

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

// pre-index content→taxonomy relationships
const _contentTaxMap = new Map<string, string[]>();
for (const ct of contentTaxonomies) {
  const r = ct as any;
  const list = _contentTaxMap.get(r.entry_id) || [];
  list.push(r.taxonomy_id);
  _contentTaxMap.set(r.entry_id, list);
}
const _taxonomyById = new Map<string, any>(
  allTaxonomies.map((t: any) => [t.id, t])
);

// pre-index content > byline relationships
const _contentBylineMap = new Map<string, any[]>();
for (const cb of contentBylines) {
  const r = cb as any;
  const list = _contentBylineMap.get(r.content_id) || [];
  list.push(r);
  _contentBylineMap.set(r.content_id, list);
}
const _bylineById = new Map<string, any>(
  allBylines.map((b: any) => [b.id, b])
);

// ── SEO lookup ──

const seoEntries = table("_emdash_seo");

// pre-index SEO entries by collection:entryId
const _seoMap = new Map<string, any>(
  seoEntries.map((s: any) => [`${s.collection}:${s.entry_id}`, s])
);

function getSeoForEntry(collection: string, entryId: string): SeoMeta | null {
  const entry = _seoMap.get(`${collection}:${entryId}`);
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
  const taxIds = _contentTaxMap.get(contentId) || [];
  return taxIds
  .map((id) => _taxonomyById.get(id))
  .filter((t): t is any => t && t.name === type)
  .map((t) => ({
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
  const links = (_contentBylineMap.get(contentId) || [])
  .slice()
  .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

  const mediaMap = getMediaMap();
  return links.map((link: any) => {
    const byline = _bylineById.get(link.byline_id) as any;
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

// memoize post/page/settings
let _postsCache: Post[] | null = null;
let _pagesCache: Page[] | null = null;
let _siteSettingsCache: SiteSettings | null = null;

// pre-index pages and posts
let _pagesBySlug: Map<string, Page> | null = null;
let _postsBySlug: Map<string, Post> | null = null;

// pre-index sections and bylines
let _sectionsBySlug: Map<string, Section> | null = null;
let _allBylinesCache: Byline[] | null = null;
let _bylinesBySlug: Map<string, Byline> | null = null;

// pre-index posts by category/tag/byline
let _postsByCategorySlug: Map<string, Post[]> | null = null;
let _postsByTagSlug: Map<string, Post[]> | null = null;
let _postsByBylineId: Map<string, Post[]> | null = null;

let _widgetAreaMap: Map<string, string> | null = null; // area name > area id
let _widgetsByAreaId: Map<string, Widget[]> | null = null;

export function getPosts(): Post[] {
  if (_postsCache) return _postsCache;
  _postsCache = table("ec_posts")
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
  _postsBySlug = new Map(_postsCache.map((p) => [p.slug, p]));

  _postsByCategorySlug = new Map();
  _postsByTagSlug = new Map();
  _postsByBylineId = new Map();
  for (const post of _postsCache) {
    for (const cat of post.categories) {
      const bucket = _postsByCategorySlug.get(cat.slug) || [];
      bucket.push(post);
      _postsByCategorySlug.set(cat.slug, bucket);
    }
    for (const tag of post.tags) {
      const bucket = _postsByTagSlug.get(tag.slug) || [];
      bucket.push(post);
      _postsByTagSlug.set(tag.slug, bucket);
    }
    for (const byline of post.bylines) {
      const bucket = _postsByBylineId.get(byline.id) || [];
      bucket.push(post);
      _postsByBylineId.set(byline.id, bucket);
    }
  }

  return _postsCache;
}

export function getPages(): Page[] {
  if (_pagesCache) return _pagesCache;
  _pagesCache = table("ec_pages")
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
  _pagesBySlug = new Map(_pagesCache.map((p) => [p.slug, p]));
  return _pagesCache;
}

export function getPageBySlug(slug: string): Page | undefined {
  if (!_pagesBySlug) getPages();
  return _pagesBySlug!.get(slug);
}

export function getPostBySlug(slug: string): Post | undefined {
  if (!_postsBySlug) getPosts();
  return _postsBySlug!.get(slug);
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
  if (_siteSettingsCache) return _siteSettingsCache;

  const options = table("options");
  const optionsMap = new Map<string, any>(options.map((o: any) => [o.name, o]));

  const get = (key: string): string => {
    const opt = optionsMap.get(key) as any;
    let val = opt?.value || "";
    if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
      try { val = JSON.parse(val); } catch {}
    }
    return val;
  };
  const getMedia = (key: string): MediaImage | null => {
    const raw = get(key);
    if (!raw) return null;
    // Option value may be a JSON object like {"mediaId":"...","alt":"..."} or a plain media ID
    let mediaId = raw;
    let altOverride: string | undefined;
    if (typeof raw === "string" && raw.startsWith("{")) {
      try {
        const parsed = JSON.parse(raw);
        mediaId = parsed.mediaId || raw;
        altOverride = parsed.alt || undefined;
      } catch {}
    } else if (typeof raw === "object" && (raw as any).mediaId) {
      altOverride = (raw as any).alt || undefined;
      mediaId = (raw as any).mediaId;
    }
    const m = getMediaMap().get(mediaId as string);
    return m ? { src: m.src, alt: altOverride || m.alt, width: m.width, height: m.height, filename: m.filename } : null;
  };

  _siteSettingsCache = {
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
  return _siteSettingsCache;
}

export function getMedia(): Map<string, MediaItem> {
  return getMediaMap();
}

export function getWidgets(areaName: string): Widget[] {
  if (!_widgetAreaMap || !_widgetsByAreaId) {
    _widgetAreaMap = new Map(
      table("_emdash_widget_areas").map((a: any) => [a.name, a.id])
    );
    _widgetsByAreaId = new Map();
    for (const w of table("_emdash_widgets")) {
      const widget = w as any;
      const bucket = _widgetsByAreaId.get(widget.area_id) || [];
      bucket.push({
        id: widget.id,
        areaId: widget.area_id,
        type: widget.type || "",
        title: widget.title || "",
        content: parseContent(widget.content),
        menuName: widget.menu_name || null,
        componentId: widget.component_id || null,
        componentProps: widget.component_props
          ? typeof widget.component_props === "string"
            ? JSON.parse(widget.component_props)
            : widget.component_props
          : null,
        sortOrder: widget.sort_order || 0,
      });
      _widgetsByAreaId.set(widget.area_id, bucket);
    }
    for (const [id, widgets] of _widgetsByAreaId) {
      _widgetsByAreaId.set(id, widgets.sort((a, b) => a.sortOrder - b.sortOrder));
    }
  }

  const areaId = _widgetAreaMap.get(areaName);
  if (!areaId) return [];
  return _widgetsByAreaId.get(areaId) || [];
}

export function getSections(): Section[] {
  // cache the mapped result
  if (_sectionsBySlug) {
    const cached: Section[] = [];
    _sectionsBySlug.forEach((s) => cached.push(s));
    return cached;
  }
  const sections = table("_emdash_sections").map((s: any) => ({
    id: s.id,
    slug: s.slug || "",
    title: s.title || "",
    description: s.description || null,
    content: parseContent(s.content),
    keywords: s.keywords || null,
  }));
  _sectionsBySlug = new Map(sections.map((s) => [s.slug, s]));
  return sections;
}

export function getSectionBySlug(slug: string): Section | undefined {
  if (!_sectionsBySlug) getSections();
  return _sectionsBySlug!.get(slug);
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
  if (!_postsByCategorySlug) getPosts();
  return _postsByCategorySlug!.get(categorySlug) || [];
}

export function getPostsByTag(tagSlug: string): Post[] {
  if (!_postsByTagSlug) getPosts();
  return _postsByTagSlug!.get(tagSlug) || [];
}

/** Get all bylines (authors) */
export function getAllBylines(): Byline[] {
  if (_allBylinesCache) return _allBylinesCache;

  const mediaMap = getMediaMap();
  _allBylinesCache = allBylines.map((b: any) => {
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
  return _allBylinesCache;
}

export function getBylineBySlug(slug: string): Byline | undefined {
  if (!_bylinesBySlug) {
    _bylinesBySlug = new Map(getAllBylines().map((b) => [b.slug, b]));
  }
  return _bylinesBySlug.get(slug);
}

/** Get posts by a specific byline */
export function getPostsByByline(bylineId: string): Post[] {
  if (!_postsByBylineId) getPosts();
  return _postsByBylineId!.get(bylineId) || [];
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