import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import { topoOrderSteps } from "@/lib/quiz-graph";
import type { QuizData } from "@/types/quiz";

type DateRange = "today" | "last_7d" | "last_30d" | "last_90d" | "custom";

// ---------------------------------------------------------------------------
// Pagination helper: PostgREST caps responses at 1000 rows. Without paging,
// analytics silently computed KPIs on a random 1000-row subset once a quiz
// passed ~1000 sessions/answers. Loops .range() batches until a short batch.
// Queries MUST have a stable .order() for range paging to be gap/dup-free.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

/** Belt-and-braces dedupe: concurrent inserts during range paging can still
 *  shift offsets; ordering on a monotonic column minimizes it and this
 *  removes any duplicate rows that slip through. */
function uniqueBy<T>(rows: T[], key: (r: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

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

  // Ordered on started_at ASC (monotonic - concurrent inserts land after
  // already-fetched offsets) with id as stable tiebreak; deduped after fetch.
  const sessionsPromise = fetchAllRows<SessionRow>((from, to) =>
    db
      .from("quiz_sessions")
      .select("id, started_at, completed_at, exit_clicked, device_type, utm, purchased, purchase_value, purchase_currency")
      .eq("quiz_id", id)
      .gte("started_at", sinceIso)
      .lte("started_at", untilIso)
      .order("started_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  // Quiz data needed to resolve option_id -> {variable, value, label} so we
  // can cohort by primary_pain, breed, age, time_per_day without storing
  // those denormalized on the session.
  const quizDataPromise = db.from("quizzes").select("data").eq("id", id).maybeSingle();

  // Compute option distribution directly from quiz_events instead of via the
  // quiz_option_distribution RPC, which returned only one row per step in
  // production (suspected DISTINCT ON bug). Raw aggregation here is more
  // reliable and lets us include question label + option label inline.
  type AnswerRow = { id: string; session_id: string; step_id: string; option_id: string; meta?: Record<string, unknown> | null };
  const allAnswersPromise = fetchAllRows<AnswerRow>((from, to) =>
    db
      .from("quiz_events")
      .select("id, session_id, step_id, option_id, meta")
      .eq("quiz_id", id)
      .eq("event_type", "answer")
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const [summaryRes, funnelRes, variantsRes, sessionsRes, quizDataRes, allAnswersRes] = await Promise.all([
    db.rpc("quiz_summary", { quiz_id_in: id, since: sinceIso, until: untilIso }),
    db.rpc("quiz_funnel_stats", { quiz_id_in: id, since: sinceIso, until: untilIso, device_filter: device, variant_filter: variantFilter }),
    db.rpc("quiz_variant_comparison", { quiz_id_in: id, since: sinceIso, until: untilIso }),
    sessionsPromise,
    quizDataPromise,
    allAnswersPromise,
  ]);

  if (summaryRes.error) return safeError(summaryRes.error, "Failed to load summary");
  if (funnelRes.error) return safeError(funnelRes.error, "Failed to load funnel");
  if (variantsRes.error) return safeError(variantsRes.error, "Failed to load variants");
  // Paged fetches: fail loudly instead of computing KPIs on truncated data
  if (sessionsRes.error) return safeError(sessionsRes.error, "Failed to load sessions");
  if (allAnswersRes.error) return safeError(allAnswersRes.error, "Failed to load answers");

  const summaryRow = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;
  const sessions: SessionRow[] = uniqueBy(sessionsRes.data ?? [], (r) => r.id);

  // Type for option distribution rows (computed below from raw answer events)
  type EnrichedOptionRow = {
    step_id: string;
    question_el_id?: string;
    option_id: string;
    option_count: number;
    option_pct_of_step: number;
    step_name: string;
    question_label: string;
    option_label: string;
  };

  // Build option_id -> { variable, value, label } map from quiz definition.
  // Lets cohort code map answer events back to human-readable labels.
  type QuizNode = {
    kind: string;
    id: string;
    name?: string;
    subEls?: Array<{
      id?: string;
      kind: string;
      variable?: string;
      title?: string;
      text?: string;
      options?: Array<{ id: string; label: string; value?: string }>;
    }>;
  };
  const quizData = (quizDataRes.data as { data?: { nodes?: Record<string, QuizNode> } } | null)?.data;
  const nodes: Record<string, QuizNode> = quizData?.nodes ?? {};
  const optionMeta = new Map<string, { variable: string; label: string; value?: string; stepId: string }>();
  const stepNames = new Map<string, string>();
  // For option distribution we also want question label + canonical step set
  const currentStepIds = new Set<string>();
  const questionElLabel = new Map<string, string>(); // question_el_id -> label/variable
  let painStepId = "", breedStepId = "", ageStepId = "", timeStepId = "";
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step") continue;
    currentStepIds.add(n.id);
    stepNames.set(n.id, n.name ?? "");
    const name = (n.name ?? "").toLowerCase();
    if (name.includes("beteendeproblem")) painStepId = n.id;
    else if (name.includes("ras")) breedStepId = n.id;
    else if (name.includes("ålder")) ageStepId = n.id;
    else if (name.includes("tid per dag")) timeStepId = n.id;
    for (const el of n.subEls ?? []) {
      if (el.kind !== "question" || !el.variable) continue;
      if (el.id) questionElLabel.set(el.id, el.variable);
      for (const o of el.options ?? []) {
        optionMeta.set(o.id, { variable: el.variable, label: o.label, value: o.value, stepId: n.id });
      }
    }
  }

  // Compute option distribution from raw answer events. Filter to current
  // quiz steps and aggregate counts per (step_id, option_id). Multi-select
  // questions naturally produce multiple events per session - we count each
  // option pick once.
  const allAnswers = uniqueBy(allAnswersRes.data ?? [], (r) => r.id);
  const optionCounts = new Map<string, Map<string, number>>(); // step_id -> Map(option_id -> count)
  for (const a of allAnswers) {
    if (!a.step_id || !a.option_id) continue;
    if (!currentStepIds.has(a.step_id)) continue;
    // Skip commit-gate answer-events from option distribution since those
    // are tracked separately in commit_gate panel.
    const src = (a.meta as { source?: string } | null)?.source ?? "";
    if (src.startsWith("commit_gate")) continue;
    let stepMap = optionCounts.get(a.step_id);
    if (!stepMap) {
      stepMap = new Map();
      optionCounts.set(a.step_id, stepMap);
    }
    stepMap.set(a.option_id, (stepMap.get(a.option_id) ?? 0) + 1);
  }
  const enrichedOptions: EnrichedOptionRow[] = [];
  for (const [stepId, optMap] of optionCounts.entries()) {
    const stepTotal = Array.from(optMap.values()).reduce((s, n) => s + n, 0);
    for (const [optionId, count] of optMap.entries()) {
      const meta = optionMeta.get(optionId);
      enrichedOptions.push({
        step_id: stepId,
        question_el_id: undefined,
        option_id: optionId,
        option_count: count,
        option_pct_of_step: stepTotal ? Math.round((count / stepTotal) * 1000) / 10 : 0,
        step_name: stepNames.get(stepId) ?? stepId,
        question_label: meta?.variable ?? "",
        option_label: meta?.label ?? optionId,
      });
    }
  }
  // Sort: step order in current quiz first, then count desc within step
  const stepIndex = new Map<string, number>();
  Array.from(currentStepIds).forEach((sid, i) => stepIndex.set(sid, i));
  enrichedOptions.sort((a, b) => {
    const sa = stepIndex.get(a.step_id) ?? 999;
    const sb = stepIndex.get(b.step_id) ?? 999;
    if (sa !== sb) return sa - sb;
    return b.option_count - a.option_count;
  });

  // ─── Identify Q1 + Offer steps for FP metrics + cohort consistency ─────────
  // Cohorts below also use offerStepIds so "completion %" everywhere on the
  // dashboard means "reached offer" (FP definition), not "clicked CTA".
  //
  // Variant-aware: when the quiz has A/B variants, the "first question" or
  // "offer" step can exist as multiple physical step_ids (one per path).
  // We expand the canonical step into the set of equivalent step_ids so the
  // metric counts a user once regardless of which variant they took.
  //
  //   Q1   = first step in topo with a question subEl. Expanded to all steps
  //          carrying a question with the same `variable` (e.g. all "Kön"
  //          steps across A/B paths).
  //   Offer = step whose name starts with "Offer page". Expanded to siblings
  //          in its variantGroupId, plus any other step matching the name
  //          pattern (covers both proper variants and parallel-named steps).
  const orderedSteps = quizData ? topoOrderSteps(quizData as QuizData) : [];
  const q1StepNode = orderedSteps.find((s) =>
    (s.subEls ?? []).some((el) => el.kind === "question"),
  ) ?? orderedSteps[0] ?? null;
  const offerStepNode = orderedSteps.find((s) => /^Offer page/i.test(s.name ?? "")) ?? null;
  const q1StepId = q1StepNode?.id ?? null;
  const offerStepId = offerStepNode?.id ?? null;

  // Q1 expansion: every step whose first question shares Q1's variable.
  const q1Variable = q1StepNode
    ? (q1StepNode.subEls ?? []).find((el) => el.kind === "question")?.variable
    : undefined;
  const q1StepIds = q1Variable
    ? orderedSteps
        .filter((s) =>
          (s.subEls ?? []).some(
            (el) => el.kind === "question" && el.variable === q1Variable,
          ),
        )
        .map((s) => s.id)
    : q1StepNode
      ? [q1StepNode.id]
      : [];
  const q1StepIdSet = new Set(q1StepIds);

  // Offer expansion: same name match plus any variant-group siblings of the
  // primary offer node. Covers both clean variant setups and quizzes that
  // simply duplicate the offer page across paths.
  const offerStepIds = (() => {
    if (!offerStepNode) return [] as string[];
    const ids = new Set<string>([offerStepNode.id]);
    for (const s of orderedSteps) {
      if (/^Offer page/i.test(s.name ?? "")) ids.add(s.id);
      if (
        offerStepNode.variantGroupId &&
        s.variantGroupId === offerStepNode.variantGroupId
      ) {
        ids.add(s.id);
      }
    }
    return Array.from(ids);
  })();

  // Sessions that fired step_view for any offer-page step. This is the
  // FP-style "completion" - reached offer page, regardless of CTA click.
  const offerReachedRes = offerStepIds.length
    ? await fetchAllRows<{ session_id: string }>((from, to) =>
        db
          .from("quiz_events")
          .select("session_id")
          .eq("quiz_id", id)
          .eq("event_type", "step_view")
          .in("step_id", offerStepIds)
          .gte("created_at", sinceIso)
          .lte("created_at", untilIso)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      )
    : { data: [] as Array<{ session_id: string }>, error: null };
  if (offerReachedRes.error) return safeError(offerReachedRes.error, "Failed to load offer views");
  const offerReachedSet = new Set(
    (offerReachedRes.data ?? []).map((r) => r.session_id),
  );

  // Fetch answer events for cohort attributes + commit-gate analytics.
  const cohortStepIds = [painStepId, breedStepId, ageStepId, timeStepId].filter(Boolean);
  const cohortAnswersRes = cohortStepIds.length
    ? await fetchAllRows<{ session_id: string; step_id: string; option_id: string }>((from, to) =>
        db
          .from("quiz_events")
          .select("session_id, step_id, option_id")
          .eq("quiz_id", id)
          .eq("event_type", "answer")
          .in("step_id", cohortStepIds)
          .gte("created_at", sinceIso)
          .lte("created_at", untilIso)
          .order("id", { ascending: true })
          .range(from, to),
      )
    : { data: [] as Array<{ session_id: string; step_id: string; option_id: string }> };

  const sessionAttr = new Map<string, { pain?: string; breed?: string; age?: string; time?: string }>();
  for (const e of cohortAnswersRes.data ?? []) {
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
      // FP-style completion: "reached offer page" (step_view), not "clicked CTA".
      if (offerReachedSet.has(s.id)) row.completions++;
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
  const gateRes = await fetchAllRows<{ session_id: string; option_id: string }>((from, to) =>
    db
      .from("quiz_events")
      .select("session_id, option_id, meta")
      .eq("quiz_id", id)
      .eq("event_type", "answer")
      .in("option_id", ["commit_redo_yes", "commit_redo_no", "commit_time_yes", "commit_time_no"])
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const gateRows = gateRes.data ?? [];
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

  // ─── Funnel Professor-style metrics ────────────────────────────────────────
  // Industry definitions (per @DTC_Quizbuilder benchmarks):
  //   Q1 Start Rate       = sessions that answered Q1   / starts.   Aim 50-70%.
  //   Quiz Completion Rate = sessions that reached offer / starts.   Aim 20-30%.
  //   Completion -> Purchase = purchases / sessions that reached offer. Aim 10%+.
  // q1StepId / offerStepId already identified above (used by cohort builder).
  // q1_sessions = distinct sessions that fired an answer event on Q1.
  // step_view alone fires synchronously on session start, so it's not a useful
  // engagement signal - the first real interaction is clicking a Q1 option.
  // Numerator and denominator must be drawn from the same time window: only
  // count Q1 answers + offer views from sessions that ALSO started in window.
  // Without this gate, a session started 60 days ago whose user returned and
  // answered Q1 yesterday would inflate today's Q1 rate above 100%.
  const startsSessionIds = new Set(sessions.map((s) => s.id));
  const offerSessions = Array.from(offerReachedSet).filter((sid) =>
    startsSessionIds.has(sid),
  ).length;
  // Q1 sessions = distinct in-window sessions that answered ANY equivalent Q1
  // step_id (covers branching paths where the same logical question lives on
  // multiple physical step nodes).
  const q1Sessions = q1StepIdSet.size
    ? new Set(
        allAnswers
          .filter(
            (a) =>
              q1StepIdSet.has(a.step_id) && startsSessionIds.has(a.session_id),
          )
          .map((a) => a.session_id),
      ).size
    : 0;

  const totalStarts = Number(summaryRow?.starts ?? 0);
  const fpMetrics = {
    q1_step_id: q1StepId,
    q1_step_name: q1StepNode?.name ?? null,
    offer_step_id: offerStepId,
    offer_step_name: offerStepNode?.name ?? null,
    q1_sessions: q1Sessions,
    offer_sessions: offerSessions,
    q1_start_rate: totalStarts > 0 ? (q1Sessions / totalStarts) * 100 : 0,
    completion_rate: totalStarts > 0 ? (offerSessions / totalStarts) * 100 : 0,
    completion_to_purchase: offerSessions > 0 ? (purchaseRows.length / offerSessions) * 100 : 0,
  };

  const response = NextResponse.json({
    summary: summaryRow ?? {
      starts: 0, completions: 0, completion_rate: 0, email_captures: 0, median_time_to_exit_sec: 0,
    },
    purchases,
    fp_metrics: fpMetrics,
    funnel: funnelRes.data ?? [],
    options: enrichedOptions,
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
