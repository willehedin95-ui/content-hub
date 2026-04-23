// src/lib/quiz-publish.ts
// Publishes a quiz to Cloudflare Pages.

import { createServerSupabase } from "@/lib/supabase-admin";
import {
  getConfig,
  getUploadToken,
  uploadFiles,
  upsertHashes,
  createDeployment,
  loadManifest,
  mergeManifest,
  md5hex,
} from "@/lib/cloudflare-pages";
import { getRuntimeBundle, generateQuizShell } from "@/lib/quiz-publish-shell";
import type { QuizRow } from "@/types/quiz";

// ---------------------------------------------------------------------------
// Market -> CF Pages project name mapping
// ---------------------------------------------------------------------------

/** Maps quiz market to the CF Pages project name (matches the env-var convention). */
function getQuizProjectName(market: "se" | "dk" | "no"): string {
  const map: Record<string, string> = {
    se: process.env.CF_PAGES_PROJECT_SV ?? "halsobladet-blog",
    dk: process.env.CF_PAGES_PROJECT_DA ?? "smarthelse",
    no: process.env.CF_PAGES_PROJECT_NO ?? "helseguiden",
  };
  const name = map[market];
  if (!name) throw new Error(`[quiz-publish] No CF Pages project for market: ${market}`);
  return name;
}

/** Maps market to the custom domain for building the public URL. */
function getQuizDomain(market: "se" | "dk" | "no"): string {
  const map: Record<string, string> = {
    se: process.env.CF_PAGES_DOMAIN_SV ?? "halsobladet.com",
    dk: process.env.CF_PAGES_DOMAIN_DA ?? "smarthelse.dk",
    no: process.env.CF_PAGES_DOMAIN_NO ?? "helseguiden.com",
  };
  return map[market] ?? `${getQuizProjectName(market)}.pages.dev`;
}

// ---------------------------------------------------------------------------
// Runtime bundle upload (idempotent)
// ---------------------------------------------------------------------------

/**
 * Checks if the runtime bundle is already uploaded to this CF Pages project.
 * If not, uploads it. Idempotent - safe to call every publish.
 */
async function ensureRuntimeBundle(
  accountId: string,
  apiToken: string,
  projectName: string,
  bundle: ReturnType<typeof getRuntimeBundle>,
): Promise<void> {
  const runtimePath = `/_runtime/${bundle.jsFilename}`;
  const existingManifest = await loadManifest(projectName);

  if (existingManifest[runtimePath]) {
    // Already uploaded, skip
    return;
  }

  const jsHash = md5hex(bundle.jsContent);
  const jwt = await getUploadToken(accountId, apiToken, projectName);

  await uploadFiles(jwt, [
    {
      hash: jsHash,
      content: bundle.jsContent,
      contentType: "application/javascript",
    },
  ]);
  await upsertHashes(jwt, [jsHash]);

  // Merge runtime path into manifest
  await mergeManifest(projectName, { [runtimePath]: jsHash });
}

// ---------------------------------------------------------------------------
// Main publish function
// ---------------------------------------------------------------------------

export async function publishQuiz(
  quizId: string,
): Promise<{ url: string; published_at: string }> {
  const db = createServerSupabase();

  // 1. Load the quiz row
  const { data: quiz, error: loadErr } = await db
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .single();
  if (loadErr || !quiz) {
    throw new Error(`[quiz-publish] Quiz not found: ${quizId}`);
  }
  const typedQuiz = quiz as QuizRow;

  // 2. Get CF config
  const { accountId, apiToken } = getConfig();
  const projectName = getQuizProjectName(typedQuiz.market);

  // 3. Discover compiled runtime bundle
  const bundle = getRuntimeBundle();

  // 4. Ensure runtime bundle is uploaded to this project
  await ensureRuntimeBundle(accountId, apiToken, projectName, bundle);

  // 5. Determine API base URL (used in __QUIZ_CONFIG__)
  const apiBaseUrl =
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!apiBaseUrl) {
    throw new Error("[quiz-publish] APP_URL or VERCEL_URL env var must be set");
  }

  // 6. Generate HTML shell
  const html = generateQuizShell(typedQuiz, bundle.hash, apiBaseUrl);

  // 7. Upload quiz HTML
  const htmlPath = `/quiz/${typedQuiz.slug}/index.html`;
  const htmlBuffer = Buffer.from(html, "utf-8");
  const htmlHash = md5hex(htmlBuffer);

  const existingManifest = await loadManifest(projectName);
  const manifest: Record<string, string> = { ...existingManifest };

  // Always include runtime bundle in deployment manifest
  const runtimePath = `/_runtime/${bundle.jsFilename}`;
  const runtimeHash = md5hex(bundle.jsContent);
  manifest[runtimePath] = runtimeHash;
  manifest[htmlPath] = htmlHash;

  // Only upload HTML if hash differs
  const existingHashes = new Set(Object.values(existingManifest));
  const filesToUpload: Array<{ hash: string; content: Buffer; contentType: string }> = [];
  if (!existingHashes.has(htmlHash)) {
    filesToUpload.push({
      hash: htmlHash,
      content: htmlBuffer,
      contentType: "text/html",
    });
  }

  const jwt = await getUploadToken(accountId, apiToken, projectName);
  if (filesToUpload.length > 0) {
    await uploadFiles(jwt, filesToUpload);
    await upsertHashes(jwt, filesToUpload.map((f) => f.hash));
  }

  // 8. Create deployment
  await createDeployment(accountId, apiToken, projectName, manifest);

  // 9. Merge new paths into DB manifest
  const newPaths: Record<string, string> = {
    [htmlPath]: htmlHash,
    [runtimePath]: runtimeHash,
  };
  await mergeManifest(projectName, newPaths);

  // 10. Build public URL
  const domain = getQuizDomain(typedQuiz.market);
  const publicUrl = `https://${domain}/quiz/${typedQuiz.slug}`;
  const publishedAt = new Date().toISOString();

  // 11. Update quizzes row
  const { error: updateErr } = await db
    .from("quizzes")
    .update({
      status: "published",
      published_url: publicUrl,
      published_at: publishedAt,
      updated_at: publishedAt,
    })
    .eq("id", quizId);
  if (updateErr) {
    throw new Error(
      `[quiz-publish] Failed to update quiz record: ${updateErr.message}`,
    );
  }

  return { url: publicUrl, published_at: publishedAt };
}
