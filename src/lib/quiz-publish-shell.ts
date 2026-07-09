// src/lib/quiz-publish-shell.ts
// Generates the static HTML shell for a published quiz page.
// The bundle is served from /_runtime/ on the CF Pages project.

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { QuizRow, QuizData } from "@/types/quiz";

/** Whole-quiz A/B variant baked alongside the primary spec. The runtime
 *  coin-flips between them and tags the session. */
export type ShellAbVariant = { id: string; splitA: number; data: QuizData };

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
 *
 * `runtimeScriptBase` defaults to `/_runtime/` which is the path CF Pages
 * serves the bundle at after publish. The Vercel-hosted preview iframe
 * passes `/quiz-bundle/` which is a Next.js route that reads the bundle
 * from disk. Both paths produce the same JS, just from different origins.
 */
export function generateQuizShell(
  quiz: QuizRow,
  bundleHash: string,
  apiBaseUrl: string,
  runtimeScriptBase: string = "/_runtime/",
  ab: ShellAbVariant | null = null,
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

  const clarityScript = providers.clarity?.projectId
    ? `<!-- Microsoft Clarity -->
<script>
(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(providers.clarity.projectId)});
</script>`
    : "";

  // Serialize quiz data - full graph (runtime resolves variants client-side).
  // Escape "</script>" and "<!--" so user-authored HTML stored in custom_html
  // blocks can't terminate the surrounding <script> tag or open an HTML comment.
  const quizDataJson = serializeForInlineScript(data);
  const settingsJson = serializeForInlineScript(settings);
  const configJson = serializeForInlineScript({
    apiBaseUrl,
    quizId: id,
    quizSlug: slug,
    market,
  });
  // Whole-quiz A/B: bake variant B's full spec so the runtime can coin-flip
  // between it and the primary spec on one URL (no redirect, one ad set).
  const abScript = ab
    ? `\n      window.__QUIZ_AB__ = ${serializeForInlineScript({ id: ab.id, splitA: ab.splitA, dataB: ab.data })};`
    : "";

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
    ${clarityScript}
    ${customCode?.head ?? ""}
  </head>
  <body>
    <div id="quiz-root"></div>
    <script>
      window.__QUIZ_DATA__ = ${quizDataJson};
      window.__QUIZ_SETTINGS__ = ${settingsJson};
      window.__QUIZ_CONFIG__ = ${configJson};${abScript}
    </script>
    <script src="${runtimeScriptBase}quiz-runtime.${bundleHash}.js" defer></script>
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

/**
 * JSON.stringify a value into a form that's safe to inline inside a `<script>`
 * tag. Handles two parser-level hazards: a literal `</script>` inside string
 * data terminates the script block early, and `<!--` opens an HTML comment.
 * U+2028/U+2029 are JSON-legal but break legacy JS parsers that read the
 * source as text.
 */
function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/<!--/g, "<\\!--");
}
