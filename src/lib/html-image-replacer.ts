import * as cheerio from "cheerio";

/**
 * Replace image URLs in HTML with optimized deploy paths.
 * Also adds loading="lazy" to all images that don't have it.
 * Images not in the urlMap keep their original URLs (fallback).
 */
export function replaceImageUrls(
  html: string,
  urlMap: Map<string, string>
): string {
  const $ = cheerio.load(html);

  // Replace <img src> and <source src>
  $("img[src], source[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src && urlMap.has(src)) {
      $(el).attr("src", urlMap.get(src)!);
    }
  });

  // Replace srcset entries on <img> and <source>
  $("img[srcset], source[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset");
    if (!srcset) return;

    const replaced = srcset
      .split(",")
      .map((entry) => {
        const parts = entry.trim().split(/\s+/);
        const url = parts[0];
        if (url && urlMap.has(url)) {
          parts[0] = urlMap.get(url)!;
        }
        return parts.join(" ");
      })
      .join(", ");

    $(el).attr("srcset", replaced);
  });

  // Add loading="lazy" to images that don't have it
  $("img:not([loading])").attr("loading", "lazy");

  return $.html();
}
