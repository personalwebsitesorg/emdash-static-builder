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
}

export interface MediaImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  filename: string;
}

export interface Taxonomy {
  id: string;
  name: string;
  slug: string;
  label: string;
}

export interface Byline {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  avatarMediaId: string | null;
  isGuest: boolean;
  role: string | null;
}

export interface MenuItem {
  id: string;
  label: string;
  url: string;
  sortOrder: number;
}

export interface SiteSettings {
  title: string;
  tagline: string;
}

export interface Widget {
  id: string;
  areaId: string;
  type: string;
  title: string;
  content: string;
  sortOrder: number;
}

// ── Singleton ──

const snapshot = snapshotRaw as unknown as Snapshot;

function table<T = RawRow>(name: string): T[] {
  return (snapshot.tables[name] || []) as T[];
}

// ── Media URL rewriting ──

const R2_PUBLIC_URL = import.meta.env.R2_PUBLIC_URL || "";

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
    }));
}

function getBylinesForContent(contentId: string): Byline[] {
  const links = contentBylines
    .filter((cb: any) => cb.content_id === contentId)
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

  return links.map((link: any) => {
    const byline = allBylines.find((b: any) => b.id === link.byline_id) as any;
    return {
      id: byline?.id || link.byline_id,
      slug: byline?.slug || "",
      displayName: byline?.display_name || "Unknown",
      bio: byline?.bio || null,
      avatarMediaId: byline?.avatar_media_id || null,
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
  return table("_emdash_menu_items")
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((r: any) => ({
      id: r.id,
      label: r.label || "",
      url: normalizeMenuUrl(r.custom_url || "/"),
      sortOrder: r.sort_order || 0,
    }));
}

export function getSiteSettings(): SiteSettings {
  const options = table("options");
  const get = (key: string) => {
    const opt = options.find((o: any) => o.name === key) as any;
    let val = opt?.value || "";
    // Strip surrounding quotes if present (emdash stores JSON-encoded strings)
    if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
      try { val = JSON.parse(val); } catch {}
    }
    return val;
  };
  return {
    title: get("site:title") || "My Site",
    tagline: get("site:tagline") || "",
  };
}

export function getMedia(): Map<string, MediaImage> {
  const map = new Map<string, MediaImage>();
  for (const row of table("media")) {
    const r = row as any;
    const src = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${r.storage_key}` : "";
    map.set(r.id, {
      src,
      alt: r.alt || "",
      width: r.width || 0,
      height: r.height || 0,
      filename: r.filename || "",
    });
  }
  return map;
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
      content: w.content || "",
      sortOrder: w.sort_order || 0,
    }));
}

export function getAllCategories(): Taxonomy[] {
  return allTaxonomies
    .filter((t: any) => t.name === "category")
    .map((t: any) => ({ id: t.id, name: t.name, slug: t.slug, label: t.label }));
}

export function getAllTags(): Taxonomy[] {
  return allTaxonomies
    .filter((t: any) => t.name === "tag")
    .map((t: any) => ({ id: t.id, name: t.name, slug: t.slug, label: t.label }));
}

export function getPostsByCategory(categorySlug: string): Post[] {
  return getPosts().filter((p) => p.categories.some((c) => c.slug === categorySlug));
}

export function getTheme(): string {
  return themeConfig.theme || "professional";
}

export function getGeneratedAt(): string {
  return snapshot.generatedAt || "";
}
