import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const maxDuration = 60;

export interface TextBlock {
  tag: string;
  text: string;
}

export interface ImageBlock {
  src: string;
  alt: string;
}

/**
 * Inline all external CSS and remove JS module bundles so the HTML is
 * self-contained and renders correctly when served from any domain.
 */
async function makeSelfContained(html: string, pageUrl: string): Promise<string> {
  const $ = cheerio.load(html);
  const origin = new URL(pageUrl).origin;

  // Resolve a URL (possibly relative / absolute-path) to a full URL
  function resolve(href: string): string {
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return "https:" + href;
    if (href.startsWith("/")) return origin + href;
    return new URL(href, pageUrl).href;
  }

  // 1. Fetch and inline all external stylesheets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkEls: cheerio.Cheerio<any>[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    linkEls.push($(el));
  });

  for (const el of linkEls) {
    const href = el.attr("href");
    if (!href) continue;
    try {
      const cssUrl = resolve(href);
      const res = await fetch(cssUrl);
      if (res.ok) {
        const css = await res.text();
        el.replaceWith(`<style>${css}</style>`);
      } else {
        // If we can't fetch it, keep the tag but make the URL absolute
        el.attr("href", cssUrl);
        el.removeAttr("crossorigin");
      }
    } catch {
      el.attr("href", resolve(href));
      el.removeAttr("crossorigin");
    }
  }

  // 2. Remove external JS module bundles (Vite/React runtime — not needed since
  //    Puppeteer already produced fully-rendered HTML). Inline scripts are kept.
  $("script[src]").each((_, el) => {
    $(el).remove();
  });
  $('link[rel="modulepreload"], link[rel="preload"][as="script"]').each((_, el) => {
    $(el).remove();
  });

  // 3. Make all remaining relative image/anchor/iframe src/href absolute
  $("img[src], source[src], source[srcset]").each((_, el) => {
    const src = $(el).attr("src");
    if (src && !src.startsWith("http") && !src.startsWith("data:")) {
      $(el).attr("src", resolve(src));
    }
    const srcset = $(el).attr("srcset");
    if (srcset) {
      const resolved = srcset
        .split(",")
        .map((part) => {
          const [u, ...rest] = part.trim().split(/\s+/);
          return [resolve(u), ...rest].join(" ");
        })
        .join(", ");
      $(el).attr("srcset", resolved);
    }
  });

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && !href.startsWith("http") && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      $(el).attr("href", resolve(href));
    }
  });

  return $.html();
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  let html = "";

  try {
    // Use Puppeteer to render JavaScript-heavy pages (e.g. Lovable/React apps)
    // In local dev, fall back to system Chrome; in production use @sparticuz/chromium binary
    const isLocal = process.env.NODE_ENV === "development";
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: isLocal
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Slowly scroll through the entire page to trigger intersection observers
    // and lazy-loaded sections, then scroll back to top
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 200;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 80);
      });
    });

    // Wait for any newly triggered network requests to finish
    await new Promise((r) => setTimeout(r, 2000));

    // Force all Framer Motion / CSS-animation hidden elements into their
    // final visible state before capturing. Without the JS runtime, elements
    // with inline `opacity:0` or off-screen transforms would stay invisible.
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
        if (el.style.opacity === "0") el.style.opacity = "1";
        if (el.style.visibility === "hidden") el.style.visibility = "visible";
        // Clear translateY/translateX that are used to slide elements in from off-screen
        const t = el.style.transform;
        if (t && t !== "none" && (t.includes("translateY") || t.includes("translateX"))) {
          el.style.transform = "none";
        }
      });
      // Also clear CSS animation initial states
      const sheet = document.createElement("style");
      sheet.textContent = "* { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; }";
      document.head.appendChild(sheet);
    });

    html = await page.content();
    await browser.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Could not fetch URL: ${message}` },
      { status: 400 }
    );
  }

  try {
    // Inline CSS and make all asset URLs absolute so the HTML renders
    // correctly when served from any domain (Netlify or our preview)
    html = await makeSelfContained(html, url);

    const $ = cheerio.load(html);

    // Title
    const title = $("title").text().trim() || "Untitled";

    // Text blocks — headings + paragraphs with meaningful content
    const textBlocks: TextBlock[] = [];
    $("h1, h2, h3, h4, p, li").each((_, el) => {
      const tag = (el as { tagName: string }).tagName.toLowerCase();
      const text = $(el).text().trim();
      if (text.length > 10) {
        textBlocks.push({ tag, text: text.slice(0, 200) });
      }
    });

    // Images
    const images: ImageBlock[] = [];
    $("img").each((_, el) => {
      let src = $(el).attr("src") || $(el).attr("data-src") || "";
      const alt = $(el).attr("alt") || "";
      if (!src || src.startsWith("data:")) return;
      if (src.startsWith("//")) src = "https:" + src;
      else if (src.startsWith("/")) {
        try {
          const base = new URL(url);
          src = base.origin + src;
        } catch {}
      }
      if (src.startsWith("http")) images.push({ src, alt });
    });

    const linkCount = $("a[href]").length;

    return NextResponse.json({
      html,
      title,
      textBlocks: textBlocks.slice(0, 100),
      images: images.slice(0, 30),
      linkCount,
      stats: {
        textBlocks: textBlocks.length,
        images: images.length,
        links: linkCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
