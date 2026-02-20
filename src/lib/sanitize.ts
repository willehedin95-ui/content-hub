import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize translated HTML before storage.
 * Allows standard HTML tags and attributes needed for landing pages
 * while stripping dangerous elements (script, iframe, event handlers).
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["style", "meta", "link", "head", "body", "html", "title"],
    ADD_ATTR: [
      "property",
      "content",
      "charset",
      "name",
      "http-equiv",
      "media",
      "sizes",
      "srcset",
      "loading",
      "decoding",
      "target",
      "rel",
    ],
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    WHOLE_DOCUMENT: true,
    FORCE_BODY: false,
  });
}
