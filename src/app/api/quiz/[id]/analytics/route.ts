import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

type DateRange = "today" | "last_7d" | "last_30d" | "last_90d" | "custom";

function resolveRange(
  range: DateRange,
  since?: string | null,
  until?: string | null,
): { since: Date; until: Date } {
  const now = new Date();
  const untilDate = until ? new Date(until) : new Date(now);
  if (range === "custom" && since) {
    return { since: new Date(since), until: untilDate };
  }
  const days =
    range === "today"
      ? 1
      : range === "last_7d"
        ? 7
        : range === "last_30d"
          ? 30
          : 90;
  const sinceDate = new Date(now);
  sinceDate.setDate(sinceDate.getDate() - days);
  return { since: sinceDate, until: untilDate };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Verify quiz belongs to this workspace
  const { data: quiz, error: quizErr } = await db
    .from("quizzes")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (quizErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const url = req.nextUrl;
  const rangeParam = (url.searchParams.get("range") ?? "last_30d") as DateRange;
  const device = url.searchParams.get("device") ?? "all";
  const variantGroupParam = url.searchParams.get("variant_group");
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");

  const { since, until } = resolveRange(rangeParam, sinceParam, untilParam);

  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  // variant_filter JSONB: if variant_group param is passed as "groupId:stepId"
  // format, convert to {groupId: stepId}
  let variantFilter: Record<string, string> | null = null;
  if (variantGroupParam) {
    const parts = variantGroupParam.split(":");
    if (parts.length === 2) {
      variantFilter = { [parts[0]]: parts[1] };
    }
  }

  // Run all RPCs + cohort aggregation in parallel. Cohort/time/gate analytics
  // are derived from quiz_sessions + quiz_events directly (no RPC) so they
  // degrade gracefully when columns are missing.
  type SessionRow = {
    id: string;
    started_at: string;
    completed_at: string | null;
    exit_clicked: boolean | null;
    device_type: string | null;
    utm: Record<string, string> | null;
    purchased: boolean | null;
    purchase_value: number | null;
    purchase_currency: string | null;
  };

  const sessionsPromise = db
    .from("quiz_sessions")
    .select("id, started_at, completed_at, exit_clicked, device_type, utm, purchased, purchase_value, purchase_currency")
    .eq("quiz_id", id)
    .gte("started_at", sinceIso)
    .lte("started_at", untilIso);

  // Quiz data needed to resolve option_id -> {variable, value, label} so we
  // can cohort by primary_pain, breed, age, time_per_day without storing
  // those denormalized on the session.
  const quizDataPromise = db.from("quizzes").select("data").eq("id", id).maybeSingle();

  const [summaryRes, funnelRes, optionsRes, variantsRes, sessionsRes, quizDataRes] = await Promise.all([
    db.rpc("quiz_summary", { quiz_id_in: id, since: sinceIso, until: untilIso }),
    db.rpc("quiz_funnel_stats", { quiz_id_in: id, since: sinceIso, until: untilIso, device_filter: device, variant_filter: variantFilter }),
    db.rpc("quiz_option_distribution", { quiz_id_in: id, since: sinceIso, until: untilIso }),
    db.rpc("quiz_variant_comparison", { quiz_id_in: id, since: sinceIso, until: untilIso }),
    sessionsPromise,
    quizDataPromise,
  ]);

  if (summaryRes.error) return safeError(summaryRes.error, "Failed to load summary");
  if (funnelRes.error) return safeError(funnelRes.error, "Failed to load funnel");
  if (optionsRes.error) return safeError(optionsRes.error, "Failed to load options");
  if (variantsRes.error) return safeError(variantsRes.error, "Failed to load variants");

  const summaryRow = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;
  const sessions: SessionRow[] = (sessionsRes.data as SessionRow[] | null) ?? [];

  // Build option_id -> { variable, value, label } map from quiz definition.
  // Lets cohort code map answer events back to human-readable labels.
  type QuizNode = {
    kind: string;
    id: string;
    name?: string;
    subEls?: Array<{
      kind: string;
      variable?: string;
      options?: Array<{ id: string; label: string; value?: string }>;
    }>;
  };
  const quizData = (quizDataRes.data as { data?: { nodes?: Record<string, QuizNode> } } | null)?.data;
  const nodes: Record<string, QuizNode> = quizData?.nodes ?? {};
  const optionMeta = new Map<string, { variable: string; label: string; value?: string; stepId: string }>();
  let painStepId = "", breedStepId = "", ageStepId = "", timeStepId = "";
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step") continue;
    const name = (n.name ?? "").toLowerCase();
    if (name.includes("beteendeproblem")) painStepId = n.id;
    else if (name.includes("ras")) breedStepId = n.id;
    else if (name.includes("ålder")) ageStepId = n.id;
    else if (name.includes("tid per dag")) timeStepId = n.id;
    for (const el of n.subEls ?? []) {
      if (el.kind !== "question" || !el.variable) continue;
      for (const o of el.options ?? []) {
        optionMeta.set(o.id, { variable: el.variable, label: o.label, value: o.value, stepId: n.id });
      }
    }
  }

  // Fetch answer events for cohort attributes + commit-gate analytics.
  const cohortStepIds = [painStepId, breedStepId, ageStepId, timeStepId].filter(Boolean);
  const cohortAnswersRes = cohortStepIds.length
    ? await db
        .from("quiz_events")
        .select("session_id, step_id, option_id")
        .eq("quiz_id", id)
        .eq("event_type", "answer")
        .in("step_id", cohortStepIds)
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
    : { data: [] as Array<{ session_id: string; step_id: string; option_id: string }> };

  const sessionAttr = new Map<string, { pain?: string; breed?: string; age?: string; time?: string }>();
  for (const e of (cohortAnswersRes.data as Array<{ session_id: string; step_id: string; option_id: string }> | null) ?? []) {
    const meta = optionMeta.get(e.option_id);
    if (!meta) continue;
    const cur = sessionAttr.get(e.session_id) ?? {};
    if (e.step_id === painStepId) cur.pain = meta.value || meta.label;
    else if (e.step_id === breedStepId) cur.breed = meta.label;
    else if (e.step_id === ageStepId) cur.age = meta.value || meta.label;
    else if (e.step_id === timeStepId) cur.time = meta.value || meta.label;
    sessionAttr.set(e.session_id, cur);
  }

  // Cohort builder
  type CohortRow = {
    key: string;
    sessions: number;
    completions: number;
    completion_rate: number;
    purchases: number;
    purchase_rate: number;
    revenue: number;
    aov: number;
  };
  function buildCohort(keyFn: (s: SessionRow) => string | null | undefined): CohortRow[] {
    const rows = new Map<string, CohortRow>();
    for (const s of sessions) {
      const key = keyFn(s);
      if (!key) continue;
      let row = rows.get(key);
      if (!row) {
        row = { key, sessions: 0, completions: 0, completion_rate: 0, purchases: 0, purchase_rate: 0, revenue: 0, aov: 0 };
        rows.set(key, row);
      }
      row.sessions++;
      if (s.exit_clicked) row.completions++;
      if (s.purchased) {
        row.purchases++;
        row.revenue += Number(s.purchase_value ?? 0);
      }
    }
    return Array.from(rows.values())
      .map((r) => ({
        ...r,
        completion_rate: r.sessions ? (r.completions / r.sessions) * 100 : 0,
        purchase_rate: r.sessions ? (r.purchases / r.sessions) * 100 : 0,
        aov: r.purchases ? r.revenue / r.purchases : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }

  const cohorts = {
    pain: buildCohort((s) => sessionAttr.get(s.id)?.pain),
    breed: buildCohort((s) => sessionAttr.get(s.id)?.breed),
    age: buildCohort((s) => sessionAttr.get(s.id)?.age),
    time_per_day: buildCohort((s) => sessionAttr.get(s.id)?.time),
    device: buildCohort((s) => s.device_type),
    utm_source: buildCohort((s) => s.utm?.utm_source),
    utm_campaign: buildCohort((s) => s.utm?.utm_campaign),
  };

  // Commit-gate analytics
  const gateRes = await db
    .from("quiz_events")
    .select("session_id, option_id, meta")
    .eq("quiz_id", id)
    .eq("event_type", "answer")
    .in("option_id", ["commit_redo_yes", "commit_redo_no", "commit_time_yes", "commit_time_no"])
    .gte("created_at", sinceIso)
    .lte("created_at", untilIso);
  const gateRows = (gateRes.data as Array<{ session_id: string; option_id: string }> | null) ?? [];
  const gateCounts: Record<string, number> = {
    commit_redo_yes: 0, commit_redo_no: 0, commit_time_yes: 0, commit_time_no: 0,
  };
  // Track session-level: for "yes-yes" path, what % went on to purchase
  const sessionGate = new Map<string, { redo?: string; time?: string }>();
  for (const r of gateRows) {
    if (r.option_id in gateCounts) gateCounts[r.option_id]++;
    const cur = sessionGate.get(r.session_id) ?? {};
    if (r.option_id.startsWith("commit_redo_")) cur.redo = r.option_id.endsWith("_yes") ? "yes" : "no";
    if (r.option_id.startsWith("commit_time_")) cur.time = r.option_id.endsWith("_yes") ? "yes" : "no";
    sessionGate.set(r.session_id, cur);
  }
  // Conversion by gate path
  const gatePaths = { yes_yes: 0, yes_no: 0, no_yes: 0, no_no: 0 };
  const gatePathPurchases = { yes_yes: 0, yes_no: 0, no_yes: 0, no_no: 0 };
  const sessionPurchased = new Map<string, boolean>(sessions.map((s) => [s.id, !!s.purchased]));
  for (const [sid, g] of sessionGate.entries()) {
    if (!g.redo || !g.time) continue;
    const key = `${g.redo}_${g.time}` as keyof typeof gatePaths;
    gatePaths[key]++;
    if (sessionPurchased.get(sid)) gatePathPurchases[key]++;
  }
  const commitGate = {
    counts: gateCounts,
    yes_rate_q1: gateCounts.commit_redo_yes + gateCounts.commit_redo_no
      ? (gateCounts.commit_redo_yes / (gateCounts.commit_redo_yes + gateCounts.commit_redo_no)) * 100 : 0,
    yes_rate_q2: gateCounts.commit_time_yes + gateCounts.commit_time_no
      ? (gateCounts.commit_time_yes / (gateCounts.commit_time_yes + gateCounts.commit_time_no)) * 100 : 0,
    paths: gatePaths,
    path_purchases: gatePathPurchases,
  };

  // Time-of-day + day-of-week pattern (UTC; client can localize if needed)
  const hourBuckets = Array(24).fill(0) as number[];
  const dowBuckets = Array(7).fill(0) as number[]; // 0 = Sunday
  // Sessions per day for last 14 days time series
  const dayBuckets = new Map<string, number>();
  // Total session duration for completed sessions
  const durationBuckets = { lt30: 0, "30-60": 0, "60-120": 0, "120-300": 0, "300-600": 0, gt600: 0 };
  for (const s of sessions) {
    const d = new Date(s.started_at);
    hourBuckets[d.getUTCHours()]++;
    dowBuckets[d.getUTCDay()]++;
    const dayKey = d.toISOString().slice(0, 10);
    dayBuckets.set(dayKey, (dayBuckets.get(dayKey) ?? 0) + 1);
    if (s.completed_at) {
      const dur = (new Date(s.completed_at).getTime() - d.getTime()) / 1000;
      if (dur < 30) durationBuckets.lt30++;
      else if (dur < 60) durationBuckets["30-60"]++;
      else if (dur < 120) durationBuckets["60-120"]++;
      else if (dur < 300) durationBuckets["120-300"]++;
      else if (dur < 600) durationBuckets["300-600"]++;
      else durationBuckets.gt600++;
    }
  }
  const timeSeries = Array.from(dayBuckets.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Aggregate purchases (kept for backwards-compat - same shape as before)
  const purchaseRows = sessions.filter((s) => s.purchased);
  const purchases = {
    count: purchaseRows.length,
    revenue: purchaseRows.reduce((sum, r) => sum + Number(r.purchase_value ?? 0), 0),
    currency: purchaseRows[0]?.purchase_currency ?? null,
    rate: summaryRow?.starts ? purchaseRows.length / Number(summaryRow.starts) : 0,
    aov: purchaseRows.length
      ? purchaseRows.reduce((sum, r) => sum + Number(r.purchase_value ?? 0), 0) / purchaseRows.length
      : 0,
  };

  const response = NextResponse.json({
    summary: summaryRow ?? {
      starts: 0, completions: 0, completion_rate: 0, email_captures: 0, median_time_to_exit_sec: 0,
    },
    purchases,
    funnel: funnelRes.data ?? [],
    options: optionsRes.data ?? [],
    variants: variantsRes.data ?? [],
    cohorts,
    commit_gate: commitGate,
    time_pattern: {
      by_hour_utc: hourBuckets,
      by_dow: dowBuckets,
      time_series: timeSeries,
      duration_buckets: durationBuckets,
    },
    range: { since: sinceIso, until: untilIso },
  });

  response.headers.set("Cache-Control", "private, max-age=60");
  return response;
}
