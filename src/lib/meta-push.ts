import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspace, getWorkspaceSettings } from "@/lib/workspace";
import { Language, COUNTRY_MAP, LANGUAGES, ConceptCopyTranslations } from "@/types";
import {
  getAdSetConfig,
  createAdSetFromTemplate,
  uploadImage,
  createAdCreative,
  createAd,
  runWithMetaConfig,
  pauseAdSetAndAds,
  activateAdSetAndAds,
} from "@/lib/meta";
import { getShortLocalizationNote } from "@/lib/localization";
import OpenAI from "openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";

/**
 * Placement rules for routing 4:5 images to feed and 9:16 to stories/reels.
 * Used with asset_customization_rules when a concept has both ratios.
 * "feed" label → all non-stories placements.
 * "stories" label → stories + reels only.
 */
export const FEED_STORIES_RULES: Array<{
  customization_spec: Record<string, unknown>;
  image_label: { name: string };
}> = [
  // Feed placements → 4:5
  { customization_spec: { publisher_platforms: ["facebook"], facebook_positions: ["feed", "marketplace", "video_feeds", "search", "profile_feed", "right_hand_column"] }, image_label: { name: "feed" } },
  { customization_spec: { publisher_platforms: ["instagram"], instagram_positions: ["stream", "explore", "explore_home", "ig_search", "profile_feed"] }, image_label: { name: "feed" } },
  { customization_spec: { publisher_platforms: ["audience_network"] }, image_label: { name: "feed" } },
  { customization_spec: { publisher_platforms: ["messenger"], messenger_positions: ["messenger_home", "sponsored_messages"] }, image_label: { name: "feed" } },
  // Stories/Reels placements → 9:16
  { customization_spec: { publisher_platforms: ["facebook"], facebook_positions: ["story", "facebook_reels"] }, image_label: { name: "stories" } },
  { customization_spec: { publisher_platforms: ["instagram"], instagram_positions: ["story", "reels"] }, image_label: { name: "stories" } },
  { customization_spec: { publisher_platforms: ["messenger"], messenger_positions: ["story"] }, image_label: { name: "stories" } },
];

/** Retry a Meta API call once after a delay (handles transient errors / rate limits).
 * Use ONLY for idempotent calls (uploads, reads) — creation calls must not be
 * retried here: the outcome of a timed-out create is unknown and a retry can
 * produce duplicate ACTIVE ads (the meta.ts layer retries mutations on 429 only). */
async function withRetry<T>(fn: () => Promise<T>, delayMs = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Don't retry validation/permission errors — only transient ones
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("(#100)") || msg.includes("(#200)") || msg.includes("(#10)")) {
      throw err; // validation or permission error, no point retrying
    }
    await new Promise((r) => setTimeout(r, delayMs));
    return await fn();
  }
}

/**
 * Next UTC instant when the Europe/Stockholm wall clock reads hh:mm.
 * The workspace schedule setting is Swedish local time; the server runs UTC,
 * so a naive setHours() would fire 1-2h late depending on DST.
 *
 * Scans wall-clock dates from probes at now/+26h/+50h and returns the first
 * strictly-future candidate: +24h probes break on the 25-hour fall-back day
 * (same Stockholm calendar date twice → a start_time in the past, which Meta
 * rejects). Exported so meta-video-push shares the same schedule math.
 */
export function nextStockholmOccurrence(hh: number, mm: number): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const wallAt = (d: Date) => {
    const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    // Some ICU builds emit "24:00" for midnight — that is 00:00 of the NEXT
    // wall date, so roll the date forward instead of mapping to the same day.
    let y = Number(p.year), mo = Number(p.month), day = Number(p.day);
    let hour = Number(p.hour);
    if (p.hour === "24") {
      hour = 0;
      const rolled = new Date(Date.UTC(y, mo - 1, day) + 86_400_000);
      y = rolled.getUTCFullYear(); mo = rolled.getUTCMonth() + 1; day = rolled.getUTCDate();
    }
    return { y, mo, d: day, utcOfWall: Date.UTC(y, mo - 1, day, hour, Number(p.minute)) };
  };
  // Convert a Stockholm wall-clock (y, mo, d, hh:mm) to the UTC instant by
  // guessing UTC=wall and correcting with the observed offset. On the
  // spring-forward day a nonexistent 02:xx never converges — the loop then
  // settles within an hour of intent, and the strictly-future scan below
  // still guarantees a valid schedule.
  const toUtc = (y: number, mo: number, d: number): Date => {
    const want = Date.UTC(y, mo - 1, d, hh, mm);
    let ts = want;
    for (let i = 0; i < 3; i++) {
      const diff = want - wallAt(new Date(ts)).utcOfWall;
      if (diff === 0) break;
      ts += diff;
    }
    return new Date(ts);
  };
  const now = new Date();
  const seen = new Set<string>();
  for (const probeMs of [0, 26 * 3_600_000, 50 * 3_600_000]) {
    const wall = wallAt(new Date(now.getTime() + probeMs));
    const key = `${wall.y}-${wall.mo}-${wall.d}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const candidate = toUtc(wall.y, wall.mo, wall.d);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  // Unreachable in practice; fall back to +24h so we never return the past.
  return new Date(now.getTime() + 86_400_000);
}

/**
 * HEAD/GET check that a URL responds with valid HTML.
 * Used as a pre-flight check before pushing ads to Meta so we don't serve
 * impressions to a dead landing page. Returns {ok: true} or {ok: false, reason}.
 * Never throws.
 *
 * Uses GET (not HEAD) because Shopify/Cloudflare sometimes handle HEAD
 * differently from real traffic. Falls back to HEAD on 405.
 * 2026-04-16: See resilience-audit-2026-04-16.md P1-2.
 */
async function verifyUrlAlive(
  url: string
): Promise<{ ok: boolean; status?: number; reason?: string }> {
  const TIMEOUT_MS = 5000;
  const MIN_BODY_BYTES = 500;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "content-hub-pre-push-check/1.0" },
    });

    // Some servers (or our own CF Pages rewrites) return 405 for GET — try HEAD
    if (res.status === 405) {
      res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "content-hub-pre-push-check/1.0" },
      });
      if (res.status !== 200) {
        return { ok: false, status: res.status, reason: `HTTP ${res.status} (HEAD)` };
      }
      return { ok: true, status: res.status };
    }

    if (res.status !== 200) {
      return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
    }

    // Only consume body if GET — HEAD has none anyway
    const body = await res.text();
    if (body.length < MIN_BODY_BYTES) {
      return { ok: false, status: res.status, reason: `body too small (${body.length} bytes)` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("abort");
    return {
      ok: false,
      reason: isTimeout ? `timeout (>${TIMEOUT_MS / 1000}s)` : `fetch failed: ${msg.slice(0, 100)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface PushResult {
  language: string;
  country: string;
  status: string;
  error?: string;
  campaign_id?: string;
  scheduled_time?: string;
  added_to_existing?: boolean;
}

/**
 * Push a concept (image_job) to Meta Ads — one ad set per target language/market.
 *
 * If a pushed ad set already exists for a market, adds new (unpushed) images
 * to the existing ad set instead of creating a new one. This supports the
 * iteration batch flow where new images are generated within the same concept.
 *
 * Returns array of per-language results + scheduled time.
 */
export async function pushConceptToMeta(
  jobId: string,
  opts?: { languages?: string[]; workspaceId?: string; metaConfig?: Record<string, unknown> | null; wsSettings?: Record<string, unknown>; activateNow?: boolean }
): Promise<{ results: PushResult[]; scheduled_time: string | null }> {
  // Resolve workspace Meta config, then run the entire push inside a
  // request-scoped config (runWithMetaConfig) so a concurrent push/cron for
  // another workspace can never swap credentials mid-flight (ads in the
  // wrong ad account). When a target workspaceId is passed without an explicit
  // config, resolve from THAT workspace — never the cookie fallback.
  let config: Parameters<typeof runWithMetaConfig>[0];
  if (opts?.metaConfig !== undefined) {
    config = opts.metaConfig as Parameters<typeof runWithMetaConfig>[0];
  } else if (opts?.workspaceId) {
    const db0 = createServerSupabase();
    const { data: wsRow, error: wsErr } = await db0
      .from("workspaces")
      .select("meta_config")
      .eq("id", opts.workspaceId)
      .single();
    if (wsErr || !wsRow) {
      throw new Error(`Failed to resolve Meta config for workspace ${opts.workspaceId}: ${wsErr?.message ?? "not found"}`);
    }
    config = (wsRow.meta_config ?? null) as Parameters<typeof runWithMetaConfig>[0];
  } else {
    config = ((await getWorkspace()).meta_config ?? null) as Parameters<typeof runWithMetaConfig>[0];
  }
  return runWithMetaConfig(config, () => pushConceptToMetaInner(jobId, opts));
}

async function pushConceptToMetaInner(
  jobId: string,
  opts?: { languages?: string[]; workspaceId?: string; metaConfig?: Record<string, unknown> | null; wsSettings?: Record<string, unknown>; activateNow?: boolean }
): Promise<{ results: PushResult[]; scheduled_time: string | null }> {
  const db = createServerSupabase();
  const wsId = opts?.workspaceId ?? await getWorkspaceId();

  // Load the concept with images + translations
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("*, source_images(*, image_translations(*))")
    .eq("workspace_id", wsId)
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    throw new Error("Concept not found");
  }

  // CHOKEPOINT GUARD: every push flow (manual concept page, launchpad, cron)
  // passes through here. Judge-REJECT (hard brand-rule violation), rejected
  // and archived concepts must never reach Meta, regardless of which upstream
  // gate was skipped or when the concept entered the pad.
  // startsWith: the tag can carry a "-norubric" suffix which must still gate.
  const jobTags = (job.tags as string[] | null) ?? [];
  if (job.status === "rejected" || jobTags.some((t) => t.startsWith("judge:REJECT"))) {
    throw new Error("Concept is judge-REJECTED — review the copy and remove the judge:REJECT tag before pushing");
  }
  if (job.archived_at || job.status === "archived") {
    throw new Error("Concept is archived — unarchive it before pushing");
  }

  if (!job.product) {
    throw new Error("Product is required");
  }

  const primaryTexts: string[] = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  if (primaryTexts.length === 0) {
    throw new Error("At least one primary text is required");
  }
  const headlineTexts: string[] = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());
  const sourceLanguage = (job.source_language as string) ?? "en";

  if (!job.landing_page_id) {
    throw new Error("Landing page is required");
  }

  // Prevent duplicate pushes — reject if there's a recent push in progress for this concept
  // Auto-expire stale "pushing" states older than 30 minutes (from crashed pushes).
  // Must filter on updated_at, not created_at: add-to-existing pushes re-claim rows that
  // were created days ago, and created_at would instantly expire the in-flight claim.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  // Expire to "error" (NOT "failed"): the reuse lookup below only matches
  // pushed/error, so a "failed" row from a hard-killed push would be invisible
  // and the next push would create a duplicate ad set while the orphaned one
  // keeps its ACTIVE ads — the double-spend path this whole block exists to close.
  await db
    .from("meta_campaigns")
    .update({ status: "error", error_message: "Push timed out (stale pushing state auto-expired)" })
    .eq("workspace_id", wsId)
    .eq("image_job_id", jobId)
    .eq("status", "pushing")
    .lt("updated_at", thirtyMinAgo);

  const { data: activePush } = await db
    .from("meta_campaigns")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("image_job_id", jobId)
    .eq("status", "pushing")
    .limit(1);
  if (activePush && activePush.length > 0) {
    throw new Error("A push is already in progress for this concept");
  }

  // Auto-assign concept number if not set
  let conceptNumber = job.concept_number;

  if (!conceptNumber) {
    const { data: assigned, error: rpcError } = await db.rpc("assign_next_concept_number", {
      p_job_id: jobId,
      p_product: job.product,
    });

    if (rpcError || assigned === null || assigned === undefined) {
      const { data: maxRow } = await db
        .from("image_jobs")
        .select("concept_number")
        .eq("product", job.product)
        .not("concept_number", "is", null)
        .order("concept_number", { ascending: false })
        .limit(1)
        .single();

      conceptNumber = (maxRow?.concept_number ?? 0) + 1;

      await db
        .from("image_jobs")
        .update({ concept_number: conceptNumber })
        .eq("id", jobId);
    } else {
      conceptNumber = assigned;
    }
  }

  const conceptNumberStr = String(conceptNumber).padStart(3, "0");
  const numberPrefix = "#";
  // Strip leading "#XXX " or "RXXX " prefix from concept name to avoid duplication in ad set name
  const conceptName = job.name.replace(/^#\d+\s*/, "").replace(/^R\d+\s*/, "").toLowerCase();

  // Load default schedule time from workspace settings (e.g. "03:00")
  // OR activate immediately when caller passes activateNow=true (manual push
  // from launchpad UI). Without a startTime, ad sets are created PAUSED — fine
  // for cron/autopilot pushes (user reviews before going live), wrong for
  // manual UI pushes ("I clicked Push, why isn't it on?").
  let scheduledStartTime: string | null = null;
  const wsSettings = opts?.wsSettings ?? await getWorkspaceSettings();
  const scheduleHHMM = wsSettings.meta_default_schedule_time as string | undefined;
  if (opts?.activateNow) {
    // Explicit "Push Now" must win over the workspace schedule setting — the
    // old precedence meant "Push Now" silently scheduled for tomorrow morning.
    // Start ~60s in the future so Meta has time to receive the creation
    // request and activate the ad set without race conditions.
    scheduledStartTime = new Date(Date.now() + 60_000).toISOString();
  } else if (scheduleHHMM) {
    const [hh, mm] = scheduleHHMM.split(":").map(Number);
    // The setting is Swedish wall-clock time; the server runs UTC.
    scheduledStartTime = nextStockholmOccurrence(hh, mm).toISOString();
  }

  // Get landing page URLs for each language (page A)
  const landingUrlByLang = new Map<string, string>();

  if (job.landing_page_id) {
    const { data: landingPageTranslations } = await db
      .from("translations")
      .select("language, published_url")
      .eq("page_id", job.landing_page_id)
      .eq("status", "published")
      .not("published_url", "is", null);

    for (const t of landingPageTranslations ?? []) {
      landingUrlByLang.set(t.language, t.published_url.trim());
    }
  }

  // Get landing page B URLs (for A/B page testing)
  const landingUrlByLangB = new Map<string, string>();
  const isPageTest = !!job.landing_page_id_b;

  if (isPageTest) {
    const { data: landingPageBTranslations } = await db
      .from("translations")
      .select("language, published_url")
      .eq("page_id", job.landing_page_id_b)
      .eq("status", "published")
      .not("published_url", "is", null);

    for (const t of landingPageBTranslations ?? []) {
      landingUrlByLangB.set(t.language, t.published_url.trim());
    }
  }

  // Get completed image translations grouped by language
  const completedTranslations = (job.source_images ?? []).flatMap(
    (si: { id: string; image_translations?: Array<{ language: string; aspect_ratio: string; status: string; translated_url: string | null; source_image_id: string }> }) =>
      (si.image_translations ?? []).filter(
        (t) => t.status === "completed" && t.translated_url
      )
  );

  // Collect source images that skipped translation — use original for all languages
  const skippedOriginals = (job.source_images ?? [])
    .filter((si: { skip_translation: boolean; original_url: string }) => si.skip_translation && si.original_url)
    .map((si: { id: string; original_url: string; processing_order: number | null }) => ({
      source_image_id: si.id,
      original_url: si.original_url,
      processing_order: si.processing_order ?? 0,
    }));

  // Find 9:16 siblings for each 4:5 translation
  const siblings9x16 = new Map<string, string>(); // key: "source_image_id:language" -> 9:16 url
  for (const t of completedTranslations) {
    if (t.aspect_ratio === "9:16" && t.translated_url) {
      siblings9x16.set(`${t.source_image_id}:${t.language}`, t.translated_url);
    }
  }

  const results: PushResult[] = [];

  // Filter languages if specified (for per-market queue pushing)
  const targetLangs = opts?.languages
    ? (job.target_languages as Language[]).filter((l) => opts.languages!.includes(l))
    : (job.target_languages as Language[]);

  // Process all target languages in parallel
  const langResults = await Promise.allSettled(
    targetLangs.map(async (lang) => {
      const country = COUNTRY_MAP[lang];
      if (!country) {
        return { language: lang, country: "??", status: "error", error: `No country mapping for ${lang}` } as const;
      }

      // Check campaign mapping + page config in parallel
      const [{ data: mapping }, { data: pageConfig }] = await Promise.all([
        db.from("meta_campaign_mappings").select("meta_campaign_id, template_adset_id, is_permanent").eq("workspace_id", wsId).eq("product", job.product).eq("country", country).eq("format", "image").single(),
        db.from("meta_page_config").select("meta_page_id, instagram_actor_id").eq("workspace_id", wsId).eq("country", country).single(),
      ]);

      if (!mapping?.meta_campaign_id || !mapping?.template_adset_id) {
        return { language: lang, country, status: "error", error: `No campaign mapping for ${job.product}/${country}. Configure in Settings.` } as const;
      }

      const isPermanent = mapping.is_permanent === true;

      const landingUrl = landingUrlByLang.get(lang);
      if (!landingUrl) {
        return { language: lang, country, status: "error", error: `No published landing page for ${lang}` } as const;
      }

      // 2026-04-16: HEAD-check the landing URL before sending to Meta so we
      // don't serve ad impressions to a dead page. If the URL is 404/timeout/
      // too small, skip this language with a clear error. The user sees which
      // languages failed and why. See resilience-audit-2026-04-16.md P1-2.
      const urlCheck = await verifyUrlAlive(landingUrl);
      if (!urlCheck.ok) {
        return {
          language: lang,
          country,
          status: "error",
          error: `Landing page not serving valid HTML: ${urlCheck.reason}. URL: ${landingUrl}`,
        } as const;
      }

      // Combine translated feed images + skipped originals into a unified list
      const feedRatio = job.target_ratios?.[0] ?? "4:5";
      const translatedForLang = completedTranslations
        .filter((t: { language: string; aspect_ratio: string }) => t.language === lang && t.aspect_ratio === feedRatio)
        .map((t: { translated_url: string; source_image_id: string }) => ({
          image_url: t.translated_url,
          source_image_id: t.source_image_id,
        }));
      const skippedForLang = skippedOriginals.map((si: { original_url: string; source_image_id: string }) => ({
        image_url: si.original_url,
        source_image_id: si.source_image_id,
      }));
      const allLangImages = [...translatedForLang, ...skippedForLang];

      if (allLangImages.length === 0) {
        return { language: lang, country, status: "error", error: `No completed ${feedRatio} images for ${lang}` } as const;
      }

      // Use original copy for the source language, pre-translated copy if available, or translate on-the-fly
      let translatedPrimaries: string[];
      let translatedHeadlines: string[];

      if (lang === sourceLanguage) {
        // Source language — use original copy directly, no translation needed
        translatedPrimaries = primaryTexts.slice(0, 1);
        translatedHeadlines = headlineTexts.slice(0, 2);
      } else {
        const preTranslated = (job.ad_copy_translations as ConceptCopyTranslations)?.[lang];
        if (preTranslated?.status === "completed" && preTranslated.primary_texts.length > 0) {
          translatedPrimaries = preTranslated.primary_texts;
          translatedHeadlines = preTranslated.headlines;
        } else {
          // Limit to 1 primary + 2 headlines for focused, higher-quality translations
          const result = await translateAdCopyBatch(primaryTexts.slice(0, 1), headlineTexts.slice(0, 2), lang, db, sourceLanguage);
          translatedPrimaries = result.translatedPrimaries;
          translatedHeadlines = result.translatedHeadlines;
        }
      }

      // Replace any leftover URL placeholders with the actual landing page URL
      const stripUrlPlaceholders = (texts: string[], url: string): string[] =>
        texts.map((t) => t.replace(/\[LÄNK\]|\[LINK\]|\[URL\]/gi, url));
      translatedPrimaries = stripUrlPlaceholders(translatedPrimaries, landingUrl);
      translatedHeadlines = stripUrlPlaceholders(translatedHeadlines, landingUrl);

      const adSetNameBase = `${country} ${numberPrefix}${conceptNumberStr} | statics | ${conceptName}`;
      const hasPageB = isPageTest && landingUrlByLangB.has(lang);
      const adSetName = hasPageB ? `${adSetNameBase} [A]` : adSetNameBase;

      // Check for existing pushed OR errored ad sets for this concept + language.
      // "pushed": add new images instead of creating a new ad set.
      // "error": a previous push partially failed — its adset may exist in Meta
      // with live (or crash-paused) ads; reusing it prevents the
      // duplicate-adset/double-spend re-push bug.
      // Fetch ALL candidates: the image dedupe must union meta_ads across every
      // row (a newer partial row must not shadow an older fuller one), and rows
      // flagged "tracking insert failed" carry untracked live ads that dedupe
      // cannot see — pushing again would duplicate them.
      const { data: existingCandidates } = await db
        .from("meta_campaigns")
        .select("id, meta_adset_id, status, error_message, meta_ads(image_url)")
        .eq("workspace_id", wsId)
        .eq("image_job_id", jobId)
        .eq("language", lang)
        .in("status", ["pushed", "error"])
        .order("created_at", { ascending: false });
      const needsReconciliation = (existingCandidates ?? []).some(
        (c) => (c.error_message ?? "").includes("tracking insert failed"),
      );
      if (needsReconciliation) {
        return {
          language: lang,
          country,
          status: "error",
          error: "Previous push left untracked ads in Meta — reconcile meta_ads against Ads Manager before re-pushing this language",
        } as const;
      }
      const allPushedUrls = new Set(
        (existingCandidates ?? []).flatMap((c) =>
          ((c.meta_ads ?? []) as Array<{ image_url: string | null }>).map((a) => a.image_url).filter(Boolean),
        ),
      );
      const existingCampaign = (existingCandidates ?? []).find((c) => c.meta_adset_id) ?? null;
      const reusedErrorRow = existingCampaign?.status === "error";

      let adSetId: string;
      let campaignId: string;
      let isAddingToExisting = false;
      // Ad sets created by THIS run — paused on crash so a partial failure
      // never leaves unreviewed ads live in Meta.
      const createdAdSetIds: string[] = [];

      if (isPermanent) {
        // Simplified structure: use permanent ad set directly (no cloning)
        adSetId = mapping.template_adset_id;

        // Check if we already have a campaign record for this concept + language
        if (existingCampaign?.meta_adset_id) {
          // Filter out already-pushed images
          // Dedupe against ads across ALL candidate rows, not just this one —
          // a newer partial row must not hide images living in an older ad set.
          const newImages = allLangImages.filter((img) => !allPushedUrls.has(img.image_url));

          if (newImages.length === 0) {
            return { language: lang, country, status: "pushed", error: undefined } as const;
          }

          campaignId = existingCampaign.id;
          isAddingToExisting = true;

          await db.from("meta_campaigns").update({
            status: "pushing",
            updated_at: new Date().toISOString(),
          }).eq("id", campaignId);

          allLangImages.length = 0;
          allLangImages.push(...newImages);
        } else {
          // Create new campaign record (tracks this concept's push)
          const { data: newCampaign } = await db
            .from("meta_campaigns")
            .insert({
              workspace_id: wsId,
              name: adSetName,
              product: job.product,
              image_job_id: jobId,
              meta_campaign_id: mapping.meta_campaign_id,
              meta_adset_id: adSetId,
              objective: "OUTCOME_TRAFFIC",
              countries: [country],
              language: lang,
              daily_budget: 0,
              status: "pushing",
              start_time: scheduledStartTime,
            })
            .select()
            .single();

          if (!newCampaign) throw new Error("Failed to create campaign record");
          campaignId = newCampaign.id;
        }
      } else if (existingCampaign?.meta_adset_id) {
        // Legacy structure: reuse existing ad set — filter out already-pushed images
        // Dedupe against ads across ALL candidate rows (see allPushedUrls above).
        const newImages = allLangImages.filter((img) => !allPushedUrls.has(img.image_url));

        if (newImages.length === 0) {
          return { language: lang, country, status: "pushed", error: undefined } as const;
        }

        adSetId = existingCampaign.meta_adset_id;
        campaignId = existingCampaign.id;
        isAddingToExisting = true;

        // Mark as pushing during the add
        await db.from("meta_campaigns").update({
          status: "pushing",
          updated_at: new Date().toISOString(),
        }).eq("id", campaignId);

        // Replace with only new images
        allLangImages.length = 0;
        allLangImages.push(...newImages);
      } else {
        // Legacy structure: Create new ad set from template config.
        // CLAIM-FIRST: insert the tracking row (status "pushing", no adset yet)
        // BEFORE creating the Meta ad set. The unique partial index
        // meta_campaigns_pushing_claim_uq makes a concurrent double-push fail
        // here instead of creating a duplicate adset, and a crash after adset
        // creation can never leave an untracked adset in Meta.
        const { data: claimRow, error: claimErr } = await db
          .from("meta_campaigns")
          .insert({
            workspace_id: wsId,
            name: adSetName,
            product: job.product,
            image_job_id: jobId,
            meta_campaign_id: mapping.meta_campaign_id,
            meta_adset_id: null,
            objective: "OUTCOME_TRAFFIC",
            countries: [country],
            language: lang,
            daily_budget: 0,
            status: "pushing",
            start_time: scheduledStartTime,
          })
          .select()
          .single();

        if (claimErr || !claimRow) {
          const isDupe = claimErr?.code === "23505";
          return {
            language: lang,
            country,
            status: "error",
            error: isDupe
              ? "A push is already in progress for this language (concurrent push blocked)"
              : `Failed to create campaign record: ${claimErr?.message ?? "insert failed"}`,
          } as const;
        }
        campaignId = claimRow.id;

        // Non-DCO (is_dynamic_creative=false) so asset_customization_rules work
        // for routing 4:5→feed and 9:16→stories/reels
        try {
          const templateConfig = await getAdSetConfig(mapping.template_adset_id);
          const newAdSet = await createAdSetFromTemplate({
            templateConfig,
            name: adSetName,
            isDynamicCreative: false,
            startTime: scheduledStartTime || undefined,
          });
          adSetId = newAdSet.id;
          createdAdSetIds.push(adSetId);
        } catch (adSetErr) {
          await db
            .from("meta_campaigns")
            .update({
              status: "error",
              error_message: `Ad set creation failed: ${adSetErr instanceof Error ? adSetErr.message : String(adSetErr)}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", campaignId);
          throw adSetErr;
        }

        const { error: patchErr } = await db
          .from("meta_campaigns")
          .update({ meta_adset_id: adSetId, updated_at: new Date().toISOString() })
          .eq("id", campaignId);
        if (patchErr) {
          // Without the recorded adset id the reuse lookup can't see this ad
          // set — the next push would create a duplicate while this one's ads
          // spend. Throw: the catch pauses the created ad set and marks the
          // row error, so the claim is safely resumable.
          throw new Error(`Failed to record adset ${adSetId} on campaign ${campaignId}: ${patchErr.message}`);
        }
      }

      const langImages = allLangImages.slice(0, 5);

      // Upsert image_job_markets entry for pipeline tracking
      // (may already exist from queue — just update meta_campaign_id)
      await db.from("image_job_markets").upsert({
        image_job_id: jobId,
        market: country,
        meta_campaign_id: campaignId,
      }, { onConflict: "image_job_id,market" });

      // Which campaign row the catch handler should flip to "error". After
      // page A is fully committed this switches to the page-B row — a B-phase
      // crash must not mark the already-live A row as failed.
      let rowToFail: string | null = campaignId;

      try {
        // Phase 1: Upload feed-ratio (4:5) AND 9:16 images in parallel.
        const uploadResults = await Promise.allSettled(
          langImages.map(async (img) => {
            const imgFeed = await withRetry(() => uploadImage(img.image_url));

            // Look up 9:16 sibling for this source image + language
            const key9x16 = `${img.source_image_id}:${lang}`;
            const url9x16 = siblings9x16.get(key9x16) ?? null;
            let hash9x16: string | null = null;
            if (url9x16) {
              const img9x16 = await withRetry(() => uploadImage(url9x16));
              hash9x16 = img9x16.hash;
            }

            return { imageHash: imgFeed.hash, imageUrl: img.image_url, hash9x16, url9x16 };
          })
        );

        // Collect successful uploads
        const uploadedImages: Array<{
          hash: string;
          url: string;
          hash9x16: string | null;
          url9x16: string | null;
        }> = [];
        for (const r of uploadResults) {
          if (r.status === "fulfilled") {
            uploadedImages.push({
              hash: r.value.imageHash,
              url: r.value.imageUrl,
              hash9x16: r.value.hash9x16,
              url9x16: r.value.url9x16,
            });
          }
        }

        if (uploadedImages.length === 0) {
          throw new Error("All image uploads failed");
        }

        // Phase 2: Create one ad per image pair with placement asset customization.
        // Non-DCO ad sets (is_dynamic_creative=false) support asset_customization_rules
        // which route 4:5→feed and 9:16→stories/reels. DCO rejects rules (subcode 1885702).
        // Non-DCO allows multiple ads per ad set — one per image variation.
        // Titles limited to 1 when using rules (subcode 1885878).
        const urlTags = `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}&utm_term=${encodeURIComponent(new URL(landingUrl!).pathname.replace(/^\/|\/$/g, ""))}`;

        // Helper: create ads for all image pairs in an ad set
        async function createAdsForImages(
          targetAdSetId: string,
          targetCampaignId: string,
          targetLandingUrl: string,
          nameBase: string,
          targetUrlTags: string,
        ) {
          for (const [i, img] of uploadedImages.entries()) {
            const adName = uploadedImages.length > 1 ? `${nameBase} [${i + 1}]` : nameBase;

            // Build image list with labels for placement routing
            const has9x16 = img.hash9x16 && img.hash9x16 !== img.hash;
            const images: Array<{ hash: string; label?: string }> = has9x16
              ? [
                  { hash: img.hash, label: "feed" },
                  { hash: img.hash9x16!, label: "stories" },
                ]
              : [{ hash: img.hash }]; // No 9:16 → no labels/rules needed

            // No extra retry wrapper on creations: the meta.ts layer retries
            // mutations on 429 only. Retrying a timed-out create here risked
            // duplicate ACTIVE ads (outcome of the first attempt unknown).
            const creative = await createAdCreative({
              name: adName,
              images,
              bodies: translatedPrimaries,
              // Titles limited to 1 when using asset_customization_rules (subcode 1885878)
              titles: translatedHeadlines.length > 0 ? [translatedHeadlines[0]] : undefined,
              linkUrl: targetLandingUrl,
              pageId: pageConfig?.meta_page_id,
              instagramUserId: pageConfig?.instagram_actor_id,
              assetCustomizationRules: has9x16 ? FEED_STORIES_RULES : undefined,
            });

            await new Promise((r) => setTimeout(r, 500)); // Rate limit delay

            const metaAd = await createAd({
              name: adName,
              adSetId: targetAdSetId,
              creativeId: creative.id,
              status: "ACTIVE",
              urlTags: targetUrlTags,
            });

            const { error: adInsertErr } = await db.from("meta_ads").insert({
              campaign_id: targetCampaignId,
              name: adName,
              image_url: img.url,
              image_url_9x16: img.url9x16,
              image_urls: [img.url],
              meta_image_hash: img.hash,
              meta_image_hash_9x16: img.hash9x16 ?? null,
              ad_copy: translatedPrimaries[0],
              headline: translatedHeadlines[0] || null,
              source_primary_text: JSON.stringify(primaryTexts),
              source_headline: JSON.stringify(headlineTexts),
              landing_page_url: targetLandingUrl,
              aspect_ratio: feedRatio,
              variation_index: i,
              meta_creative_id: creative.id,
              meta_ad_id: metaAd.id,
              status: "pushed",
            });
            if (adInsertErr) {
              // The ad EXISTS in Meta but our tracking failed — without the row,
              // re-push dedupe (pushedUrls) would duplicate it. Surface loudly.
              throw new Error(
                `Ad ${metaAd.id} created in Meta but tracking insert failed (${adInsertErr.message}) — do not re-push before reconciling meta_ads`,
              );
            }
          }
        }

        // Create ads for page A
        await createAdsForImages(adSetId, campaignId, landingUrl, adSetName, urlTags);

        // If we are resuming a crashed push ("error" row), the crash handler
        // paused the ad set and its ads — re-activate, or this "pushed" result
        // would silently never deliver.
        if (reusedErrorRow && adSetId) {
          await activateAdSetAndAds(adSetId);
        }

        await db
          .from("meta_campaigns")
          .update({
            status: "pushed",
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId);

        // Page A is now fully committed — its ad set must not be paused and
        // its row must not be error-flipped if the page-B section below
        // crashes (only B's own ad set/row may be rolled back).
        createdAdSetIds.length = 0;
        rowToFail = null;

        // ── Page Test: Create ad set B for the second landing page ──
        if (hasPageB && !isAddingToExisting) {
          const landingUrlB = landingUrlByLangB.get(lang)!;
          const adSetNameB = `${adSetNameBase} [B]`;

          // Create a new ad set from template for page B (non-DCO for PAC rules)
          const templateConfigB = await getAdSetConfig(mapping.template_adset_id);
          const newAdSetB = await createAdSetFromTemplate({
            templateConfig: templateConfigB,
            name: adSetNameB,
            isDynamicCreative: false,
            startTime: scheduledStartTime || undefined,
          });
          createdAdSetIds.push(newAdSetB.id);

          const { data: newCampaignB } = await db
            .from("meta_campaigns")
            .insert({
              workspace_id: wsId,
              name: adSetNameB,
              product: job.product,
              image_job_id: jobId,
              meta_campaign_id: mapping.meta_campaign_id,
              meta_adset_id: newAdSetB.id,
              objective: "OUTCOME_TRAFFIC",
              countries: [country],
              language: lang,
              daily_budget: 0,
              status: "pushing",
              start_time: scheduledStartTime,
            })
            .select()
            .single();

          if (!newCampaignB) throw new Error("Failed to create campaign record for page B");
          rowToFail = newCampaignB.id;

          const urlTagsB = `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}&utm_term=${encodeURIComponent(new URL(landingUrlB).pathname.replace(/^\/|\/$/g, ""))}`;

          // Create ads for page B using same uploaded images
          await createAdsForImages(newAdSetB.id, newCampaignB.id, landingUrlB, adSetNameB, urlTagsB);

          await db.from("meta_campaigns").update({
            status: "pushed",
            error_message: null,
            updated_at: new Date().toISOString(),
          }).eq("id", newCampaignB.id);

          // Create page test record + link ad sets
          const testName = `${conceptName} — page test`;
          const { data: existingTest } = await db
            .from("page_tests")
            .select("id")
            .eq("workspace_id", wsId)
            .eq("image_job_id", jobId)
            .eq("page_a_id", job.landing_page_id)
            .eq("page_b_id", job.landing_page_id_b)
            .limit(1)
            .single();

          let pageTestId: string;
          if (existingTest) {
            pageTestId = existingTest.id;
          } else {
            const { data: newTest } = await db
              .from("page_tests")
              .insert({
                workspace_id: wsId,
                name: testName,
                image_job_id: jobId,
                page_a_id: job.landing_page_id,
                page_b_id: job.landing_page_id_b,
              })
              .select("id")
              .single();
            pageTestId = newTest!.id;
          }

          // Link both ad sets to the page test
          await db.from("page_test_adsets").insert([
            {
              page_test_id: pageTestId,
              variant: "a",
              meta_campaign_record_id: campaignId,
              meta_adset_id: adSetId,
              language: lang,
              country,
            },
            {
              page_test_id: pageTestId,
              variant: "b",
              meta_campaign_record_id: newCampaignB.id,
              meta_adset_id: newAdSetB.id,
              language: lang,
              country,
            },
          ]);
        }
      } catch (crashErr) {
        // Pause any ad sets created by THIS run so a partial failure never
        // leaves unreviewed ads spending in Meta (re-push would otherwise
        // duplicate them while the old ones stay ACTIVE). Never pause
        // pre-existing ad sets (adding-to-existing = live, reviewed ads).
        for (const createdId of createdAdSetIds) {
          try {
            await pauseAdSetAndAds(createdId);
          } catch (pauseErr) {
            console.error(`[meta-push] Failed to pause adset ${createdId} after crash: ${pauseErr instanceof Error ? pauseErr.message : pauseErr}`);
          }
        }
        // Mark the failing phase's campaign row as error so it doesn't stay
        // stuck in "pushing" (rowToFail is null when page A already committed
        // and the crash happened before the B row existed — nothing to flip).
        if (rowToFail) {
          await db
            .from("meta_campaigns")
            .update({
              status: "error",
              error_message: `${crashErr instanceof Error ? crashErr.message : "Push crashed unexpectedly"}${createdAdSetIds.length ? " (created ad sets paused)" : ""}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", rowToFail);
        }
        throw crashErr; // Re-throw so it's reported as a failure for this language
      }

      // Re-read campaign status (set inside the try block above)
      const { data: finalCampaign } = await db
        .from("meta_campaigns")
        .select("status")
        .eq("id", campaignId)
        .single();
      const finalStatus = finalCampaign?.status === "pushed" ? "pushed" : "error";

      return {
        language: lang,
        country,
        status: finalStatus,
        campaign_id: campaignId,
        scheduled_time: isAddingToExisting ? undefined : (scheduledStartTime || undefined),
        error: finalStatus === "pushed" ? undefined : "Some or all ads failed to push",
        added_to_existing: isAddingToExisting,
      } as const;
    })
  );

  // Collect results from all languages
  for (let i = 0; i < langResults.length; i++) {
    const r = langResults[i];
    if (r.status === "fulfilled") {
      results.push(r.value);
    } else {
      const lang = targetLangs[i];
      const country = COUNTRY_MAP[lang] ?? "??";
      results.push({ language: lang, country, status: "error", error: r.reason?.message ?? "Push failed" });
    }
  }

  return { results, scheduled_time: scheduledStartTime };
}

/**
 * Translate all ad copy variants using GPT-4o (single API call for all variants)
 */
export async function translateAdCopyBatch(
  primaryTexts: string[],
  headlines: string[],
  language: Language,
  db: ReturnType<typeof createServerSupabase>,
  sourceLanguage?: string
): Promise<{ translatedPrimaries: string[]; translatedHeadlines: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const openai = new OpenAI({ apiKey });
  const langLabel = LANGUAGES.find((l) => l.value === language)?.label ?? language;
  const sourceLangLabel = sourceLanguage
    ? (LANGUAGES.find((l) => l.value === sourceLanguage)?.label ?? "English")
    : "English";

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 4000,
    messages: [
      {
        role: "system",
        content: `You are a professional ad copywriter and translator. Translate all ad copy variants from ${sourceLangLabel} to ${langLabel}.
Maintain the tone, style, and persuasive power of the original.
Adapt cultural references and idioms naturally.${getShortLocalizationNote(language)}
IMPORTANT: If the text contains URL placeholders like [LINK], [LÄNK], [URL] or website addresses, replace them with a natural call-to-action phrase in ${langLabel} (e.g. "Handla nu", "Köp här", "Shop now"). The landing page link is attached separately by the ad platform and must NOT appear in the ad copy text.
Return a JSON object with exactly two keys:
- "primary_texts": an array of translated primary texts (same order as input)
- "headlines": an array of translated headlines (same order as input)
No other text.`,
      },
      {
        role: "user",
        content: JSON.stringify({ primary_texts: primaryTexts, headlines }),
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No translation returned");

  const parsed = JSON.parse(content) as { primary_texts: string[]; headlines: string[] };

  // Log usage
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  await db.from("usage_logs").insert({
    type: "translation",
    page_id: null,
    translation_id: null,
    model: OPENAI_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: calcOpenAICost(inputTokens, outputTokens),
    metadata: { purpose: "concept_push_copy_translation", language, variant_count: primaryTexts.length + headlines.length },
  });

  return {
    translatedPrimaries: parsed.primary_texts,
    translatedHeadlines: parsed.headlines,
  };
}
