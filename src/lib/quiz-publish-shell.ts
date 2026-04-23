// src/lib/quiz-publish-shell.ts
// Generates the static HTML shell for a published quiz page.
// The bundle is served from /_runtime/ on the CF Pages project.

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { QuizRow } from "@/types/quiz";

// ---------------------------------------------------------------------------
// Bundle discovery
// ---------------------------------------------------------------------------

const RUNTIME_DIR = join(process.cwd(), "runtime", "quiz-runtime", "dist");

export type BundleInfo = {
  jsFilename: string; // e.g. "quiz-runtime.CxHLibBY.js"
  jsContent: Buffer;
  hash: string; // e.g. "CxHLibBY"
};

/**
 * Reads the compiled bundle from runtime/quiz-runtime/dist/.
 * Returns the JS filename, content buffer, and hash segment.
 * Throws if the dist directory is empty or missing.
 */
export function getRuntimeBundle(): BundleInfo {
  let files: string[];
  try {
    files = readdirSync(RUNTIME_DIR);
  } catch {
    throw new Error(
      `[quiz-publish-shell] runtime/quiz-runtime/dist/ not found. Run: cd runtime/quiz-runtime && npm run build`,
    );
  }

  const jsFile = files.find((f) => f.startsWith("quiz-runtime.") && f.endsWith(".js"));
  if (!jsFile) {
    throw new Error(
      `[quiz-publish-shell] No quiz-runtime.*.js found in dist/. Run: cd runtime/quiz-runtime && npm run build`,
    );
  }

  // Extract hash from filename: "quiz-runtime.{hash}.js"
  const parts = jsFile.replace(".js", "").split(".");
  const hash = parts[parts.length - 1] ?? "unknown";

  const jsContent = readFileSync(join(RUNTIME_DIR, jsFile));
  return { jsFilename: jsFile, jsContent, hash };
}

// ---------------------------------------------------------------------------
// HTML shell generator
// ---------------------------------------------------------------------------

/**
 * Returns the complete HTML string for the published quiz page.
 *
 * The `quiz` row's data.nodes should already have variants baked in
 * (the full graph is passed to the runtime which resolves variants client-side).
 */
export function generateQuizShell(
  quiz: QuizRow,
  bundleHash: string,
  apiBaseUrl: string,
): string {
  const { settings, data, id, slug, market } = quiz;
  const { metadata, providers, customCode } = settings;

  const langAttr = market === "dk" ? "da" : market === "no" ? "no" : "sv";

  const metaPixelScript = providers.metaPixel?.pixelId
    ? `<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init',${JSON.stringify(providers.metaPixel.pixelId)});
</script>`
    : "";

  // Serialize quiz data - full graph (runtime resolves variants client-side)
  const quizDataJson = JSON.stringify(data);
  const settingsJson = JSON.stringify(settings);
  const configJson = JSON.stringify({
    apiBaseUrl,
    quizId: id,
    market,
  });

  return `<!doctype html>
<html lang="${langAttr}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeAttr(metadata.description)}">
    ${metadata.ogImage ? `<meta property="og:image" content="${escapeAttr(metadata.ogImage)}">` : ""}
    ${metadata.favicon ? `<link rel="icon" href="${escapeAttr(metadata.favicon)}">` : ""}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    ${metaPixelScript}
    ${customCode?.head ?? ""}
  </head>
  <body>
    <div id="quiz-root"></div>
    <script>
      window.__QUIZ_DATA__ = ${quizDataJson};
      window.__QUIZ_SETTINGS__ = ${settingsJson};
      window.__QUIZ_CONFIG__ = ${configJson};
    </script>
    <script src="/_runtime/quiz-runtime.${bundleHash}.js" defer></script>
    ${customCode?.bodyEnd ?? ""}
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
