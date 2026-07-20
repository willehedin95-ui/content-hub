import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendMessage, isTelegramDisabled } from "@/lib/telegram";

export const maxDuration = 180;

const FETCH_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT = 3;
const MIN_BODY_BYTES = 500;
// Retry with spaced backoff so a single transient blip / rate-limit rejection
// doesn't fire a false alarm (hardening mirrors scripts/uptime-watch.mjs,
// 2026-07-20). RETRY_BACKOFF_MS[i] is the wait AFTER attempt i, before the next.
const ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [4_000, 10_000];
const CHUNK_GAP_MS = 1_000;
// 429/430 mean the checker itself is being throttled (bursty datacenter IP),
// never that the page is down - retry, but never alert if that's all we saw.
const THROTTLE_STATUSES = new Set([429, 430]);
// Real browser UA - a "HealthCheck" UA from Vercel's datacenter IP gets
// bot-flagged (429/503/challenge) by Shopify/Cloudflare far more readily.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CheckResult {
  url: string;
  ok: boolean;
  issues: string[];
  statusCode?: number;
  bodyLength?: number;
  responseMs?: number;
}

/**
 * Daily landing page health check.
 * Fetches every landing page URL used in active Meta ads and verifies
 * it returns a valid HTML page. Alerts via Telegram on any failure.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Get all distinct landing page URLs from active (pushed) Meta ads
  const { data: activeAds, error } = await db
    .from("meta_ads")
    .select("landing_page_url, meta_campaigns!inner(workspace_id, status)")
    .not("landing_page_url", "is", null)
    .eq("meta_campaigns.status", "pushed");

  if (error) {
    console.error("[landing-page-health] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build set of silenced workspace ids (notifications_disabled)
  const { data: allWs } = await db.from("workspaces").select("id, name, settings");
  const silencedWsIds = new Set(
    (allWs ?? []).filter((w) => isTelegramDisabled(w)).map((w) => w.id as string),
  );

  // Deduplicate URLs and track which workspace each belongs to.
  // Skip URLs whose only owners are silenced workspaces.
  const urlToWorkspaces = new Map<string, Set<string>>();
  for (const ad of activeAds ?? []) {
    const url = ad.landing_page_url as string;
    const campaign = ad.meta_campaigns as unknown as { workspace_id: string; status: string };
    if (!url || !campaign?.workspace_id) continue;
    if (silencedWsIds.has(campaign.workspace_id)) continue;
    if (!urlToWorkspaces.has(url)) urlToWorkspaces.set(url, new Set());
    urlToWorkspaces.get(url)!.add(campaign.workspace_id);
  }

  const urls = [...urlToWorkspaces.keys()];
  if (urls.length === 0) {
    return NextResponse.json({ checked: 0, message: "No active landing pages found" });
  }

  // Check URLs in small batches with a gap between them, so we never present
  // as a burst that trips the storefront's per-IP rate limiter (the cause of
  // the correlated 429/503 false alarms the uptime watch hit on 2026-07-18).
  const results: CheckResult[] = [];
  for (let i = 0; i < urls.length; i += MAX_CONCURRENT) {
    const batch = urls.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(batch.map(checkUrl));
    results.push(...batchResults);
    if (i + MAX_CONCURRENT < urls.length) await sleep(CHUNK_GAP_MS);
  }

  const broken = results.filter((r) => !r.ok);

  // Send Telegram alert if any pages are broken
  if (broken.length > 0) {
    // Group by workspace for context (reuse workspaces fetched above)
    const wsNames = new Map((allWs ?? []).map((w) => [w.id, w.name]));

    const lines = broken.map((r) => {
      const wsIds = urlToWorkspaces.get(r.url);
      const names = wsIds ? [...wsIds].map((id) => wsNames.get(id) ?? "?").join(", ") : "?";
      return `  • ${r.url}\n    ${r.issues.join(" | ")} [${names}]`;
    });

    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      await sendMessage(
        chatId,
        `🚨 Landing Page Health Check\n\n${broken.length} of ${urls.length} pages have issues:\n\n${lines.join("\n\n")}\n\n⚠️ Active Meta ads point to these pages — check immediately.`
      );
    }
  }

  return NextResponse.json({
    checked: urls.length,
    ok: results.filter((r) => r.ok).length,
    broken: broken.length,
    issues: broken.map((r) => ({ url: r.url, issues: r.issues, statusCode: r.statusCode })),
  });
}

async function checkUrl(url: string): Promise<CheckResult> {
  const start = Date.now();
  let throttledOnly = true; // stays true only if every failed attempt was 429/430
  let hardIssues: string[] = [];
  let lastThrottle = "";
  let statusCode: number | undefined;
  let bodyLength: number | undefined;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
        },
      });
      statusCode = res.status;
      const body = await res.text();
      bodyLength = body.length;

      if (THROTTLE_STATUSES.has(res.status)) {
        // Checker throttled - retry, but this alone never counts as "down".
        lastThrottle = `HTTP ${res.status}`;
      } else {
        const issues: string[] = [];
        if (res.status !== 200) issues.push(`HTTP ${res.status}`);
        if (body.length < MIN_BODY_BYTES) issues.push(`Too small (${body.length} bytes)`);
        if (!body.includes("</html>") && !body.includes("</HTML>")) {
          issues.push("Missing </html> - not valid HTML");
        }
        if (issues.length === 0) {
          return { url, ok: true, issues: [], statusCode: res.status, bodyLength: body.length, responseMs: Date.now() - start };
        }
        hardIssues = issues;
        throttledOnly = false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const name = err instanceof Error ? err.name : "";
      const isTimeout = name === "TimeoutError" || msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
      hardIssues = [isTimeout ? `Timeout (>${FETCH_TIMEOUT_MS / 1000}s)` : `Fetch failed: ${msg.slice(0, 100)}`];
      throttledOnly = false;
    }

    if (attempt < ATTEMPTS - 1) {
      await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
    }
  }

  // Only ever saw 429/430: the checker was throttled, not the page down. Skip.
  if (throttledOnly) {
    console.warn(`[landing-page-health] throttled, not alerting: ${url} (${lastThrottle})`);
    return { url, ok: true, issues: [], statusCode, bodyLength, responseMs: Date.now() - start };
  }

  return { url, ok: false, issues: hardIssues, statusCode, bodyLength, responseMs: Date.now() - start };
}
