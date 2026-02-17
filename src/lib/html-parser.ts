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
