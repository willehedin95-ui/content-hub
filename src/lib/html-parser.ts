import * as cheerio from "cheerio";
import type { Element, Text as TextNode, Node as DomNode } from "domhandler";

export interface ExtractedContent {
  texts: Array<{ id: string; text: string }>;
  metas: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
  };
  alts: Array<{ id: string; alt: string }>;
  modifiedHtml: string;
}

/**
 * Extract all translatable content from HTML
 */
export function extractContent(html: string): ExtractedContent {
  const $ = cheerio.load(html);
  const texts: Array<{ id: string; text: string }> = [];
  const alts: Array<{ id: string; alt: string }> = [];

  // Assign a unique data-tid to each text node's parent for mapping back
  let counter = 0;

  $("body *").each((_, el) => {
    const element = $(el);
    const tagName = (el as Element).tagName?.toLowerCase();

    // Skip script, style, noscript
    if (["script", "style", "noscript", "svg", "path"].includes(tagName))
      return;

    // Process direct text nodes
    element.contents().each((_, node) => {
      if (node.type === "text") {
        const raw = (node as TextNode).data;
        const text = raw.trim();
        if (text.length > 1) {
          const id = `t${counter++}`;
          // Preserve leading/trailing whitespace around placeholder
          const leading = raw.match(/^\s*/)?.[0] || "";
          const trailing = raw.match(/\s*$/)?.[0] || "";
          (node as TextNode).data = `${leading}{{${id}}}${trailing}`;
          texts.push({ id, text });
        }
      }
    });

    // Process alt attributes
    if (tagName === "img") {
      const alt = element.attr("alt");
      if (alt && alt.trim().length > 0) {
        const id = `a${counter++}`;
        element.attr("alt", `{{${id}}}`);
        alts.push({ id, alt: alt.trim() });
      }
    }
  });

  // Extract meta content
  const metas: ExtractedContent["metas"] = {
    title: $("title").text().trim() || undefined,
    description:
      $('meta[name="description"]').attr("content")?.trim() || undefined,
    ogTitle: $('meta[property="og:title"]').attr("content")?.trim() || undefined,
    ogDescription:
      $('meta[property="og:description"]').attr("content")?.trim() || undefined,
  };

  return { texts, metas, alts, modifiedHtml: $.html() };
}

/**
 * Replace placeholders in HTML with translated content
 */
export function applyTranslations(
  html: string,
  translations: Record<string, string>,
  metaTranslations: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
  }
): string {
  const $ = cheerio.load(html);

  // Replace text placeholders
  let result = $.html();
  for (const [id, translated] of Object.entries(translations)) {
    result = result.replace(
      new RegExp(`\\{\\{${id}\\}\\}`, "g"),
      translated.replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
      )
    );
  }

  // Apply meta translations
  const $2 = cheerio.load(result);
  if (metaTranslations.title) $2("title").text(metaTranslations.title);
  if (metaTranslations.description)
    $2('meta[name="description"]').attr("content", metaTranslations.description);
  if (metaTranslations.ogTitle)
    $2('meta[property="og:title"]').attr("content", metaTranslations.ogTitle);
  if (metaTranslations.ogDescription)
    $2('meta[property="og:description"]').attr(
      "content",
      metaTranslations.ogDescription
    );

  return $2.html();
}

const SKIP_TAGS = new Set(["script", "style", "noscript", "svg", "path", "head"]);
const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "tr", "br", "hr", "blockquote", "section", "article", "header", "footer",
]);

/** All block-level HTML elements (used for leaf-block detection) */
const BLOCK_LEVEL = new Set([
  "address", "article", "aside", "blockquote", "caption", "dd", "details",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "label", "li",
  "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody",
  "td", "tfoot", "th", "thead", "tr", "ul",
]);

export interface ExtractedBlocks {
  blocks: Array<{ id: string; tag: string; html: string }>;
  metas: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
  };
  alts: Array<{ id: string; alt: string }>;
  modifiedHtml: string;
}

/**
 * Extract translatable block-level elements from HTML.
 *
 * Instead of splitting into individual text nodes (which destroys sentence
 * context), this extracts complete "leaf blocks" — block-level elements that
 * contain no nested block-level children. Each block's innerHTML is preserved
 * (including inline tags like <strong>, <em>, <span>, <a>) so GPT translates
 * complete semantic units (full sentences with styling context intact).
 */
export function extractBlocks(html: string): ExtractedBlocks {
  const $ = cheerio.load(html);
  const blocks: Array<{ id: string; tag: string; html: string }> = [];
  const alts: Array<{ id: string; alt: string }> = [];
  let counter = 0;

  const blockSelector = Array.from(BLOCK_LEVEL).join(",");

  $("body *").each((_, el) => {
    const element = $(el);
    const tagName = (el as Element).tagName?.toLowerCase();
    if (!tagName || SKIP_TAGS.has(tagName)) return;

    // Extract img alt attributes
    if (tagName === "img") {
      const alt = element.attr("alt");
      if (alt && alt.trim().length > 0) {
        const id = `a${counter++}`;
        element.attr("alt", `{{${id}}}`);
        alts.push({ id, alt: alt.trim() });
      }
      return;
    }

    // Only process block-level elements
    if (!BLOCK_LEVEL.has(tagName)) return;

    // Skip if this block has any block-level descendants (not a leaf)
    if (element.find(blockSelector).length > 0) return;

    // Get innerHTML — skip empty or trivial blocks
    const innerHTML = element.html();
    if (!innerHTML || innerHTML.trim().length <= 1) return;

    // Must have actual visible text (not just HTML tags / whitespace)
    const textContent = element.text().trim();
    if (textContent.length <= 1) return;

    const id = `b${counter++}`;
    element.html(`{{${id}}}`);
    blocks.push({ id, tag: tagName, html: innerHTML });
  });

  // Second pass: capture loose text nodes not inside any extracted block
  // (e.g. text directly inside a div that also contains block children)
  $("body *").each((_, el) => {
    const element = $(el);
    const tagName = (el as Element).tagName?.toLowerCase();
    if (!tagName || SKIP_TAGS.has(tagName)) return;

    element.contents().each((_, node) => {
      if (node.type === "text") {
        const raw = (node as TextNode).data;
        const text = raw.trim();
        // Skip if already a placeholder, too short, or just whitespace
        if (text.length <= 1 || text.startsWith("{{")) return;
        const id = `t${counter++}`;
        const leading = raw.match(/^\s*/)?.[0] || "";
        const trailing = raw.match(/\s*$/)?.[0] || "";
        (node as TextNode).data = `${leading}{{${id}}}${trailing}`;
        blocks.push({ id, tag: "text", html: text });
      }
    });
  });

  // Extract meta content
  const metas: ExtractedBlocks["metas"] = {
    title: $("title").text().trim() || undefined,
    description:
      $('meta[name="description"]').attr("content")?.trim() || undefined,
    ogTitle:
      $('meta[property="og:title"]').attr("content")?.trim() || undefined,
    ogDescription:
      $('meta[property="og:description"]').attr("content")?.trim() || undefined,
  };

  return { blocks, metas, alts, modifiedHtml: $.html() };
}

/**
 * Replace block/text/alt placeholders with translated content.
 * Block translations (b-prefix) are inserted as-is since they contain valid HTML.
 * Alt/text translations are HTML-escaped.
 */
export function applyBlockTranslations(
  html: string,
  translations: Record<string, string>,
  metaTranslations: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
  }
): string {
  let result = html;
  for (const [id, translated] of Object.entries(translations)) {
    // Block values contain HTML from GPT — insert as-is
    // Alt/text values are plain text — HTML-escape
    const value = id.startsWith("b")
      ? translated
      : translated.replace(/[&<>"']/g, (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
        );
    result = result.replace(new RegExp(`\\{\\{${id}\\}\\}`, "g"), value);
  }

  // Apply meta translations
  const $ = cheerio.load(result);
  if (metaTranslations.title) $("title").text(metaTranslations.title);
  if (metaTranslations.description)
    $('meta[name="description"]').attr("content", metaTranslations.description);
  if (metaTranslations.ogTitle)
    $('meta[property="og:title"]').attr("content", metaTranslations.ogTitle);
  if (metaTranslations.ogDescription)
    $('meta[property="og:description"]').attr(
      "content",
      metaTranslations.ogDescription
    );

  return $.html();
}

/**
 * Strip non-translatable elements (style, svg, noscript, script) from the HTML
 * body, replacing them with HTML comment placeholders. Also separates the head
 * from the body so only the actual translatable body content is sent to GPT.
 *
 * Returns the cleaned body HTML (~13K tokens for a typical 146K-char page)
 * plus everything needed to reconstruct the full page after translation.
 */
export function stripForTranslation(fullHtml: string): {
  bodyHtml: string;
  headHtml: string;
  stripped: Array<{ placeholder: string; original: string }>;
} {
  const $ = cheerio.load(fullHtml);

  const headHtml = $("head").html() || "";
  const stripped: Array<{ placeholder: string; original: string }> = [];
  let counter = 0;

  function stripElement(el: Element) {
    const placeholder = `<!-- __STRIP_${counter}__ -->`;
    const original = $(el).toString();
    stripped.push({ placeholder, original });
    $(el).replaceWith(placeholder);
    counter++;
  }

  // Strip scripts, styles, SVGs, noscript
  $("body")
    .find("style, svg, noscript, script")
    .each((_, el) => stripElement(el as Element));

  // Strip hidden elements (display:none, visibility:hidden, hidden attribute)
  $("body [hidden]").each((_, el) => stripElement(el as Element));
  $("body").find("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) {
      stripElement(el as Element);
    }
  });

  // Strip common Shopify/ecommerce non-content elements
  $("body").find("iframe, video, audio, canvas, [data-shopify]").each((_, el) => {
    // Only strip if the element has no meaningful text
    const text = $(el).text().trim();
    if (text.length < 10) {
      stripElement(el as Element);
    }
  });

  const bodyHtml = $("body").html() || "";

  return { bodyHtml, headHtml, stripped };
}

/**
 * Reconstruct the full HTML page after translation.
 * Re-inserts stripped elements (style, svg, etc.) into the translated body,
 * re-attaches the original head, and applies meta translations.
 */
export function restoreAfterTranslation(
  translatedBodyHtml: string,
  headHtml: string,
  stripped: Array<{ placeholder: string; original: string }>,
  metaTranslations: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
  }
): string {
  // Restore stripped elements into the translated body
  let restoredBody = translatedBodyHtml;
  for (const { placeholder, original } of stripped) {
    restoredBody = restoredBody.replace(placeholder, original);
  }

  // Reconstruct full document with original head + translated body
  const $ = cheerio.load(
    `<!DOCTYPE html><html><head>${headHtml}</head><body>${restoredBody}</body></html>`
  );

  // Apply meta translations — use dedicated og fields when available, fallback to title/description
  if (metaTranslations.title) {
    $("title").text(metaTranslations.title);
  }
  if (metaTranslations.description) {
    $('meta[name="description"]').attr("content", metaTranslations.description);
  }
  const ogTitle = metaTranslations.ogTitle || metaTranslations.title;
  const ogDesc = metaTranslations.ogDescription || metaTranslations.description;
  if (ogTitle) {
    $('meta[property="og:title"]').attr("content", ogTitle);
  }
  if (ogDesc) {
    $('meta[property="og:description"]').attr("content", ogDesc);
  }

  return $.html();
}

/**
 * Compact HTML for the swiper by replacing verbose class/style attributes
 * with short IDs. This dramatically reduces token count for pages with
 * utility CSS (e.g. Tailwind). Data-* attributes are removed entirely.
 * Whitespace is normalized.
 *
 * Claude rewrites text content only — the compacted attrs pass through
 * unchanged and are restored afterward via decompactAfterSwiper().
 */
export function compactForSwiper(bodyHtml: string): {
  compact: string;
  classMap: string[];
  styleMap: string[];
} {
  const classMap: string[] = [];
  const classLookup = new Map<string, number>();
  const styleMap: string[] = [];
  const styleLookup = new Map<string, number>();

  let compact = bodyHtml;

  // Compact class attributes (biggest savings — Tailwind classes are huge)
  compact = compact.replace(/\bclass="([^"]*)"/g, (_, value: string) => {
    let id = classLookup.get(value);
    if (id === undefined) {
      id = classMap.length;
      classMap.push(value);
      classLookup.set(value, id);
    }
    return `class="c${id}"`;
  });

  // Also handle single-quoted class attributes
  compact = compact.replace(/\bclass='([^']*)'/g, (_, value: string) => {
    let id = classLookup.get(value);
    if (id === undefined) {
      id = classMap.length;
      classMap.push(value);
      classLookup.set(value, id);
    }
    return `class="c${id}"`;
  });

  // Compact style attributes
  compact = compact.replace(/\bstyle="([^"]*)"/g, (_, value: string) => {
    let id = styleLookup.get(value);
    if (id === undefined) {
      id = styleMap.length;
      styleMap.push(value);
      styleLookup.set(value, id);
    }
    return `style="s${id}"`;
  });

  // Remove data-* attributes (not needed for text rewriting)
  compact = compact.replace(/\s+data-[a-z][\w.-]*="[^"]*"/gi, "");
  compact = compact.replace(/\s+data-[a-z][\w.-]*='[^']*'/gi, "");

  // Normalize whitespace: collapse runs of whitespace between tags
  compact = compact.replace(/>\s{2,}</g, "> <");
  compact = compact.replace(/\n\s*\n/g, "\n");

  return { compact, classMap, styleMap };
}

/**
 * Restore compacted class/style attributes in Claude's rewritten HTML.
 */
export function decompactAfterSwiper(
  html: string,
  classMap: string[],
  styleMap: string[]
): string {
  let result = html;

  // Restore class attributes
  result = result.replace(/\bclass="c(\d+)"/g, (_, idStr: string) => {
    const original = classMap[parseInt(idStr)];
    return original !== undefined ? `class="${original}"` : `class="c${idStr}"`;
  });

  // Restore style attributes
  result = result.replace(/\bstyle="s(\d+)"/g, (_, idStr: string) => {
    const original = styleMap[parseInt(idStr)];
    return original !== undefined ? `style="${original}"` : `style="s${idStr}"`;
  });

  return result;
}

/**
 * Extract all visible text from HTML as a continuous readable string.
 * Preserves paragraph breaks for block elements so GPT-4o can evaluate
 * the full page context holistically.
 */
export function extractReadableText(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];

  function walk(nodes: DomNode[]) {
    for (const node of nodes) {
      if (node.type === "text") {
        const text = (node as TextNode).data.trim();
        if (text) parts.push(text);
      } else if (node.type === "tag") {
        const el = node as Element;
        if (SKIP_TAGS.has(el.tagName?.toLowerCase())) continue;
        if (BLOCK_TAGS.has(el.tagName?.toLowerCase())) parts.push("\n");
        walk(el.children);
        if (BLOCK_TAGS.has(el.tagName?.toLowerCase())) parts.push("\n");
      }
    }
  }

  const body = $("body");
  if (body.length) {
    walk(body.contents().toArray());
  } else {
    walk($.root().contents().toArray());
  }

  return parts
    .join(" ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
