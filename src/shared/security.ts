// utilities for sanitizing urls, html and svg

// escapes common html entities to prevent xss
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// validate and sanitize url
export function getSafeUrl(url: string): string {
  if (!url) return "#";
  try {
    // handle both absolute and relative urls
    const base = "http://localhost";
    const parsed = new URL(url, base);
    const protocol = parsed.protocol.toLowerCase();

    // whitelist safe protocols
    const safeProtocols = ["http:", "https:", "mailto:", "tel:"];

    // if its a relative url, it will have the bases protocol
    if (url.startsWith("/") || url.startsWith("#") || url.startsWith("./") || url.startsWith("../")) {
      return url;
    }

    if (safeProtocols.includes(protocol)) {
      return url;
    }

    return "#";
  } catch (e) {
    return "#";
  }
}

// sanitize an SVG string
export function sanitizeSvg(svg: string): string {
  if (!svg) return "";

  // 1 remove dangerous tags
  let sanitized = svg.replace(/<(script|foreignObject|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "");
  sanitized = sanitized.replace(/<(script|foreignObject|iframe|object|embed)[^>]*\/>/gi, "");

  // 2 remove dangerous attributes
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*(['"])(?:(?!\1).)*\1/gi, "");
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "");

  // 3 specifically block javascript:
  sanitized = sanitized.replace(/\s+(?:xlink:)?href\s*=\s*(['"])\s*javascript:[^"']*\1/gi, ' href="#"');

  // 4 clean up any remaining potentially dangerous patterns
  sanitized = sanitized.replace(/\s+(?:xlink:)?href\s*=\s*(['"])\s*(?:data|vbscript):[^"']*\1/gi, ' href="#"');

  return sanitized;
}
