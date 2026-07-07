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
// Publish target resolution
// ---------------------------------------------------------------------------

type PublishTarget = {
  projectName: string;
  domain: string;
  /** Path under the domain. Default "/quiz/" for shared market projects, "/"
   *  for workspaces with a dedicated subdomain. */
  pathPrefix: string;
};

/** Maps quiz market to the CF Pages project name (matches the env-var convention).
 *  Env values are trimmed - a trailing newline in e.g. CF_PAGES_PROJECT_DA
 *  ("smarthelse\n") silently targets a non-existent CF project. */
function getQuizProjectName(market: "se" | "dk" | "no"): string {
  const map: Record<string, string> = {
    se: (process.env.CF_PAGES_PROJECT_SV ?? "halsobladet-blog").trim(),
    dk: (process.env.CF_PAGES_PROJECT_DA ?? "smarthelse").trim(),
    no: (process.env.CF_PAGES_PROJECT_NO ?? "helseguiden").trim(),
  };
  const name = map[market];
  if (!name) throw new Error(`[quiz-publish] No CF Pages project for market: ${market}`);
  return name;
}

/** Maps market to the custom domain for building the public URL. */
function getQuizDomain(market: "se" | "dk" | "no"): string {
  const map: Record<string, string> = {
    se: (process.env.CF_PAGES_DOMAIN_SV ?? "halsobladet.com").trim(),
    dk: (process.env.CF_PAGES_DOMAIN_DA ?? "smarthelse.dk").trim(),
    no: (process.env.CF_PAGES_DOMAIN_NO ?? "helseguiden.com").trim(),
  };
  return map[market] ?? `${getQuizProjectName(market)}.pages.dev`;
}

/**
 * Resolve where to publish this quiz. Workspace-level overrides win over
 * market mapping, so a workspace like Doginwork can publish to its own
 * subdomain (quiz.doginwork.se) without changing the shared market projects.
 *
 * Workspace settings shape:
 * ```
 * settings.quiz_publish = {
 *   cf_pages_project: "doginwork-quiz",
 *   domain: "quiz.doginwork.se",
 *   path_prefix: "/"  // optional, defaults to "/"
 * }
 * ```
 */
async function getPublishTarget(workspaceId: string, market: "se" | "dk" | "no"): Promise<PublishTarget> {
  const db = createServerSupabase();
  const { data: ws } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .maybeSingle();

  const settings = ws?.settings as { quiz_publish?: { cf_pages_project?: string; domain?: string; path_prefix?: string } } | null;
  const override = settings?.quiz_publish;
  if (override?.cf_pages_project && override?.domain) {
    return {
      projectName: override.cf_pages_project,
      domain: override.domain,
      pathPrefix: override.path_prefix ?? "/",
    };
  }

  return {
    projectName: getQuizProjectName(market),
    domain: getQuizDomain(market),
    pathPrefix: "/quiz/",
  };
}

// ---------------------------------------------------------------------------
// API base URL sanity check
// ---------------------------------------------------------------------------

/**
 * Confirm `apiBaseUrl` is reachable AND hosts our quiz API before baking it
 * into the published HTML shell. Without this, a misconfigured APP_URL bakes
 * a dead/foreign URL into the shell and every session/event POST silently
 * 404s on someone else's server.
 *
 * Detection: OPTIONS /api/quiz/session with an allowed origin. Our handler
 * always returns 204 with the exact CORS method header "POST, OPTIONS". A
 * stranger's 404 page won't.
 */
async function verifyApiBaseUrl(apiBaseUrl: string): Promise<void> {
  if (!/^https?:\/\//i.test(apiBaseUrl)) {
    throw new Error(`[quiz-publish] apiBaseUrl is not http(s): ${apiBaseUrl}`);
  }

  const probeUrl = `${apiBaseUrl.replace(/\/$/, "")}/api/quiz/session`;
  let res: Response;
  try {
    res = await fetch(probeUrl, {
      method: "OPTIONS",
      headers: { Origin: "https://halsobladet.com" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new Error(
      `[quiz-publish] Could not reach ${probeUrl}: ${(e as Error).message}. ` +
      `Check that APP_URL points to the live content-hub deployment.`,
    );
  }

  const allowMethods = res.headers.get("access-control-allow-methods") ?? "";
  if (res.status !== 204 || !allowMethods.toUpperCase().includes("POST")) {
    throw new Error(
      `[quiz-publish] ${probeUrl} returned ${res.status} without expected ` +
      `CORS headers - APP_URL is probably pointing to a different deployment. ` +
      `Verify APP_URL=${apiBaseUrl} hosts /api/quiz/session.`,
    );
  }
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

  // 2. Get CF config + per-workspace publish target
  const { accountId, apiToken } = getConfig();
  const target = await getPublishTarget(typedQuiz.workspace_id, typedQuiz.market);
  const { projectName, domain, pathPrefix } = target;

  // 2b. Workspace-level Meta Pixel fallback. If the quiz has no pixel ID set
  //     in its own settings, inherit from `workspaces.meta_config.pixel_id`.
  //     This means new quizzes get tracking automatically without per-quiz
  //     config, and removing a workspace pixel disables tracking everywhere.
  const { data: ws } = await db
    .from("workspaces")
    .select("meta_config")
    .eq("id", typedQuiz.workspace_id)
    .maybeSingle();
  const workspacePixelId = (ws?.meta_config as { pixel_id?: string } | null)?.pixel_id;
  if (workspacePixelId && !typedQuiz.settings.providers?.metaPixel?.pixelId) {
    typedQuiz.settings = {
      ...typedQuiz.settings,
      providers: {
        ...typedQuiz.settings.providers,
        metaPixel: {
          ...(typedQuiz.settings.providers?.metaPixel ?? {}),
          pixelId: workspacePixelId,
        },
      },
    };
  }

  // 3. Discover compiled runtime bundle
  const bundle = getRuntimeBundle();

  // 4. Ensure runtime bundle is uploaded to this project
  await ensureRuntimeBundle(accountId, apiToken, projectName, bundle);

  // 5. Determine API base URL (used in __QUIZ_CONFIG__). Trimmed - a stray
  //    trailing newline in APP_URL bakes a broken URL into the shell.
  const apiBaseUrl = (
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).trim();
  if (!apiBaseUrl) {
    throw new Error("[quiz-publish] APP_URL or VERCEL_URL env var must be set");
  }

  // 5b. Sanity check: confirm apiBaseUrl actually hosts our quiz API. Without
  // this we silently bake whatever URL APP_URL points at into the shell - and
  // if it points at a stranger's deployment (happened once: APP_URL was set to
  // an old auto-generated alias that another Vercel project later claimed),
  // every session/event POST 404s and zero data lands in quiz_sessions.
  await verifyApiBaseUrl(apiBaseUrl);

  // 6. Generate HTML shell
  const html = generateQuizShell(typedQuiz, bundle.hash, apiBaseUrl);

  // 7. Upload quiz HTML
  const htmlPath = `${pathPrefix}${typedQuiz.slug}/index.html`;
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
  const publicUrl = `https://${domain}${pathPrefix}${typedQuiz.slug}`;
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
