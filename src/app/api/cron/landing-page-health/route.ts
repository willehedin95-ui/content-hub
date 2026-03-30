import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendMessage } from "@/lib/telegram";

export const maxDuration = 120;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT = 5;
const MIN_BODY_BYTES = 500;

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

  // Deduplicate URLs and track which workspace each belongs to
  const urlToWorkspaces = new Map<string, Set<string>>();
  for (const ad of activeAds ?? []) {
    const url = ad.landing_page_url as string;
    const campaign = ad.meta_campaigns as unknown as { workspace_id: string; status: string };
    if (!url || !campaign?.workspace_id) continue;
    if (!urlToWorkspaces.has(url)) urlToWorkspaces.set(url, new Set());
    urlToWorkspaces.get(url)!.add(campaign.workspace_id);
  }

  const urls = [...urlToWorkspaces.keys()];
  if (urls.length === 0) {
    return NextResponse.json({ checked: 0, message: "No active landing pages found" });
  }

  // Check URLs in parallel batches
  const results: CheckResult[] = [];
  for (let i = 0; i < urls.length; i += MAX_CONCURRENT) {
    const batch = urls.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(batch.map(checkUrl));
    results.push(...batchResults);
  }

  const broken = results.filter((r) => !r.ok);

  // Send Telegram alert if any pages are broken
  if (broken.length > 0) {
    // Group by workspace for context
    const { data: workspaces } = await db.from("workspaces").select("id, name");
    const wsNames = new Map((workspaces ?? []).map((w) => [w.id, w.name]));

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
  const issues: string[] = [];
  const start = Date.now();

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "ContentHub-HealthCheck/1.0" },
    });

    const responseMs = Date.now() - start;
    const body = await res.text();

    if (res.status !== 200) {
      issues.push(`HTTP ${res.status}`);
    }

    if (body.length < MIN_BODY_BYTES) {
      issues.push(`Too small (${body.length} bytes)`);
    }

    if (!body.includes("</html>") && !body.includes("</HTML>")) {
      issues.push("Missing </html> — not valid HTML");
    }

    return {
      url,
      ok: issues.length === 0,
      issues,
      statusCode: res.status,
      bodyLength: body.length,
      responseMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = msg.includes("timeout") || msg.includes("abort");
    issues.push(isTimeout ? `Timeout (>${FETCH_TIMEOUT_MS / 1000}s)` : `Fetch failed: ${msg.slice(0, 100)}`);

    return {
      url,
      ok: false,
      issues,
      responseMs: Date.now() - start,
    };
  }
}
