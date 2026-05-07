// scripts/reconcile-quiz-metrics.ts
//
// Three-source reconciliation for any quiz:
//   1. quiz_sessions.purchased=true   (Shopify webhook ground truth)
//   2. meta_capi_events status=sent   (CAPI events we shipped to Meta)
//   3. Meta API actions[purchase]     (Meta-attributed purchases for ads
//      whose link URL points at the quiz's published domain)
//
// Run: npx tsx scripts/reconcile-quiz-metrics.ts <quiz_id> [days=30]
//
// Reads creds from .env.local. Always uses single Meta action_type to
// avoid the double-counting trap (purchase + offsite_conversion.fb_pixel_purchase
// + onsite_web_purchase overlap heavily).

import { createServerSupabase } from "../src/lib/supabase-admin";

// Load .env.local using Node 20+'s built-in env file loader. Falls back to
// already-set env vars (e.g. when invoked from a wrapper that exports them).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // Already loaded or file missing - rely on existing process.env
}

type AdSetReport = {
  ad_set_id: string;
  ad_set_name: string;
  spend: number;
  purchases: number;
  link_url: string | null;
};

type ReconciliationReport = {
  quiz_id: string;
  quiz_name: string;
  workspace_id: string;
  range: { since: string; until: string };
  source1_quiz_sessions_purchased: number;
  source2_capi_events_sent: number;
  source2_capi_events_failed: number;
  source3_meta_attributed: number;
  meta_ad_sets_pointing_to_quiz: AdSetReport[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  diff_explanation: string;
};

async function fetchAdSetsForDomain(
  adAccountId: string,
  token: string,
  domain: string,
  since: string,
  until: string,
): Promise<AdSetReport[]> {
  const fields =
    "id,name,ads{creative{object_story_spec{link_data{link},video_data{call_to_action{value{link}}}},asset_feed_spec{link_urls{website_url}}}},insights.time_range({'since':'" +
    since.slice(0, 10) +
    "','until':'" +
    until.slice(0, 10) +
    "'}){spend,actions}";
  const url = new URL(
    `https://graph.facebook.com/v22.0/act_${adAccountId}/adsets`,
  );
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Meta API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    data: Array<{
      id: string;
      name: string;
      ads?: { data: Array<{ creative?: Record<string, unknown> }> };
      insights?: { data: Array<{ spend?: string; actions?: Array<{ action_type: string; value: string }> }> };
    }>;
  };

  const reports: AdSetReport[] = [];
  for (const adSet of json.data) {
    // Find any ad in this set whose link points at the quiz domain
    let matchedUrl: string | null = null;
    for (const ad of adSet.ads?.data ?? []) {
      const c = ad.creative ?? {};
      const spec = (c.object_story_spec ?? {}) as {
        link_data?: { link?: string };
        video_data?: { call_to_action?: { value?: { link?: string } } };
      };
      const afs = (c.asset_feed_spec ?? {}) as {
        link_urls?: Array<{ website_url?: string }>;
      };
      const urls = [
        spec.link_data?.link,
        spec.video_data?.call_to_action?.value?.link,
        ...(afs.link_urls?.map((u) => u.website_url) ?? []),
      ].filter((u): u is string => !!u);
      const match = urls.find((u) => u.includes(domain));
      if (match) {
        matchedUrl = match;
        break;
      }
    }
    if (!matchedUrl) continue;

    const ins = adSet.insights?.data?.[0] ?? {};
    const spend = parseFloat(ins.spend ?? "0") || 0;
    // SINGLE action_type to avoid double-counting. "purchase" is the
    // canonical aggregated metric in Meta UI's "Website purchases" column.
    let purchases = 0;
    for (const a of ins.actions ?? []) {
      if (a.action_type === "purchase") {
        purchases = parseInt(a.value, 10) || 0;
        break;
      }
    }
    reports.push({
      ad_set_id: adSet.id,
      ad_set_name: adSet.name,
      spend,
      purchases,
      link_url: matchedUrl,
    });
  }
  return reports;
}

async function reconcile(quizId: string, days: number): Promise<ReconciliationReport> {
  const db = createServerSupabase();

  // Load quiz + workspace
  const { data: quiz, error: quizErr } = await db
    .from("quizzes")
    .select("id, name, workspace_id, published_url")
    .eq("id", quizId)
    .single();
  if (quizErr || !quiz) throw new Error(`Quiz not found: ${quizId}`);

  const { data: ws } = await db
    .from("workspaces")
    .select("meta_config")
    .eq("id", quiz.workspace_id)
    .single();
  const metaConfig = (ws?.meta_config ?? {}) as {
    ad_account_id?: string;
    pixel_id?: string;
  };
  if (!metaConfig.ad_account_id) {
    throw new Error(`No ad_account_id configured for workspace ${quiz.workspace_id}`);
  }
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN not set");

  // Date range
  const until = new Date();
  const since = new Date(Date.now() - days * 86400000);
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  // Quiz domain (extracted from published_url, e.g. quiz.doginwork.se)
  let domain = "";
  try {
    domain = new URL(quiz.published_url ?? "").hostname;
  } catch {
    throw new Error(`Quiz has no valid published_url: ${quiz.published_url}`);
  }

  // ── Source 1: quiz_sessions.purchased ────────────────────────────────────
  const { count: source1 } = await db
    .from("quiz_sessions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", quizId)
    .eq("purchased", true)
    .gte("purchased_at", sinceIso)
    .lte("purchased_at", untilIso);

  // ── Source 2: meta_capi_events ───────────────────────────────────────────
  const { count: capiSent } = await db
    .from("meta_capi_events")
    .select("id", { count: "exact", head: true })
    .eq("event_name", "Purchase")
    .eq("status", "sent")
    .gte("sent_at", sinceIso)
    .lte("sent_at", untilIso);
  const { count: capiFailed } = await db
    .from("meta_capi_events")
    .select("id", { count: "exact", head: true })
    .eq("event_name", "Purchase")
    .eq("status", "failed")
    .gte("sent_at", sinceIso)
    .lte("sent_at", untilIso);

  // ── Source 3: Meta API ───────────────────────────────────────────────────
  const adSets = await fetchAdSetsForDomain(
    metaConfig.ad_account_id,
    token,
    domain,
    sinceIso,
    untilIso,
  );
  const source3 = adSets.reduce((s, a) => s + a.purchases, 0);

  // Confidence: HIGH if all 3 sources agree, MEDIUM if 2 agree, LOW otherwise.
  const s1 = source1 ?? 0;
  const s2 = capiSent ?? 0;
  const s3 = source3;
  let confidence: "HIGH" | "MEDIUM" | "LOW";
  if (s1 === s2 && s2 === s3) confidence = "HIGH";
  else if (s1 === s2 || s1 === s3 || s2 === s3) confidence = "MEDIUM";
  else confidence = "LOW";

  let diff_explanation = "";
  if (s3 > s1) {
    diff_explanation = `Meta over-attributes by ${s3 - s1} (likely 7-day click window crediting non-quiz orders to quiz ads).`;
  } else if (s1 > s3) {
    diff_explanation = `Shopify webhook caught ${s1 - s3} purchases Meta didn't attribute (likely iOS/blocker-affected sessions).`;
  } else {
    diff_explanation = "Meta and ground truth agree.";
  }
  if (s2 < s1) {
    diff_explanation += ` ${s1 - s2} ground-truth purchases not logged to CAPI (might have predated logging).`;
  }
  if ((capiFailed ?? 0) > 0) {
    diff_explanation += ` ${capiFailed} CAPI events failed - check meta_capi_events.error_message.`;
  }

  return {
    quiz_id: quizId,
    quiz_name: quiz.name,
    workspace_id: quiz.workspace_id,
    range: { since: sinceIso, until: untilIso },
    source1_quiz_sessions_purchased: s1,
    source2_capi_events_sent: s2,
    source2_capi_events_failed: capiFailed ?? 0,
    source3_meta_attributed: s3,
    meta_ad_sets_pointing_to_quiz: adSets,
    confidence,
    diff_explanation,
  };
}

async function main() {
  const quizId = process.argv[2];
  const days = parseInt(process.argv[3] ?? "30", 10);
  if (!quizId) {
    console.error("Usage: npx tsx scripts/reconcile-quiz-metrics.ts <quiz_id> [days=30]");
    process.exit(1);
  }

  const report = await reconcile(quizId, days);
  const horiz = "─".repeat(80);
  console.log(horiz);
  console.log(`Quiz: ${report.quiz_name} (${report.quiz_id.slice(0, 8)}...)`);
  console.log(`Range: last ${days}d`);
  console.log(horiz);
  console.log(
    `  Source 1 - quiz_sessions.purchased=true:    ${report.source1_quiz_sessions_purchased.toString().padStart(4)}  (Shopify webhook ground truth)`,
  );
  console.log(
    `  Source 2 - meta_capi_events sent:           ${report.source2_capi_events_sent.toString().padStart(4)}  (server-side CAPI we shipped${report.source2_capi_events_failed > 0 ? `, +${report.source2_capi_events_failed} failed` : ""})`,
  );
  console.log(
    `  Source 3 - Meta API quiz-driving ad sets:   ${report.source3_meta_attributed.toString().padStart(4)}  (Meta-attributed via 7d-click)`,
  );
  console.log(horiz);
  console.log(`  Confidence: ${report.confidence}`);
  console.log(`  ${report.diff_explanation}`);
  console.log(horiz);
  if (report.meta_ad_sets_pointing_to_quiz.length > 0) {
    console.log(`Quiz-driving ad sets (Meta):`);
    for (const a of report.meta_ad_sets_pointing_to_quiz) {
      const cpa = a.purchases > 0 ? (a.spend / a.purchases).toFixed(0) : "-";
      console.log(`  ${a.ad_set_name.padEnd(50)} spend=${a.spend.toFixed(0).padStart(6)} | purchases=${a.purchases} | CPA=${cpa}`);
    }
  } else {
    console.log(`No Meta ad sets found pointing to quiz domain.`);
  }
}

main().catch((err) => {
  console.error("Reconciliation failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
