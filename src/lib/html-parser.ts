import * as cheerio from "cheerio";
import type { Element, Text as TextNode } from "domhandler";

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
        const text = (node as TextNode).data.trim();
        if (text.length > 1) {
          const id = `t${counter++}`;
          (node as TextNode).data = `{{${id}}}`;
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
