// GET /api/quiz/[id]/ab-test/results
// A-vs-B scoreboard for a whole-quiz A/B test, from first-party quiz data.
// All sessions run under Variant A's quiz_id; the flipped variant is stamped on
// quiz_sessions.variant_assignments["ab_<variantId>"]. Per variant we report
// sessions, completion (reached an offer step), purchases, revenue, and a
// two-proportion significance test on the purchase rate.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { resolveExperiment, abAssignmentKey } from "@/lib/ab-test";
import type { QuizData } from "@/types/quiz";

const PAGE = 1000;

async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await make(from, from + PAGE - 1);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

/** Ids of steps whose name looks like an offer page, across both specs. */
function offerStepIds(...specs: (QuizData | null | undefined)[]): Set<string> {
  const ids = new Set<string>();
  for (const spec of specs) {
    for (const node of Object.values(spec?.nodes ?? {})) {
      if (node.kind === "step" && /offer/i.test(node.name ?? "")) ids.add(node.id);
    }
  }
  return ids;
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Two-proportion z-test on purchase rate (purchases / sessions). */
function significance(a: Arm, b: Arm) {
  const MIN = 30;
  if (a.sessions < MIN || b.sessions < MIN) {
    return { confident: false, p_value: 1, winner: null as null | "a" | "b", enough_data: false };
  }
  const p1 = a.purchases / a.sessions;
  const p2 = b.purchases / b.sessions;
  const pooled = (a.purchases + b.purchases) / (a.sessions + b.sessions);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.sessions + 1 / b.sessions));
  if (se <= 0) return { confident: false, p_value: 1, winner: null, enough_data: true };
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  return {
    confident: pValue < 0.05,
    p_value: Math.round(pValue * 10000) / 10000,
    winner: pValue < 0.05 ? (p2 > p1 ? "b" : "a") : null,
    enough_data: true,
  } as const;
}

type Arm = {
  sessions: number;
  completions: number;
  purchases: number;
  revenue: number;
};

function metrics(arm: Arm) {
  return {
    ...arm,
    revenue: Math.round(arm.revenue * 100) / 100,
    completion_rate: arm.sessions ? Math.round((arm.completions / arm.sessions) * 1000) / 10 : 0,
    purchase_rate: arm.sessions ? Math.round((arm.purchases / arm.sessions) * 1000) / 10 : 0,
    aov: arm.purchases ? Math.round((arm.revenue / arm.purchases) * 100) / 100 : 0,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 401 });

  const db = createServerSupabase();
  const exp = await resolveExperiment(db, workspaceId, id);
  if (!exp) return NextResponse.json({ error: "Not an A/B test" }, { status: 404 });

  const key = abAssignmentKey(exp.variantId);

  // Specs (for offer-step detection across both variants).
  const { data: specs } = await db
    .from("quizzes")
    .select("id, data")
    .in("id", [exp.ownerId, exp.variantId]);
  const specById = new Map((specs ?? []).map((s) => [s.id as string, s.data as QuizData]));
  const offerIds = offerStepIds(specById.get(exp.ownerId), specById.get(exp.variantId));

  // Sessions (all under owner A's quiz_id), with their flipped variant.
  type SessionRow = {
    id: string;
    variant_assignments: Record<string, string> | null;
    purchased: boolean | null;
    purchase_value: number | null;
    started_at: string;
  };
  const sessions = await fetchAll<SessionRow>((from, to) =>
    db
      .from("quiz_sessions")
      .select("id, variant_assignments, purchased, purchase_value, started_at")
      .eq("quiz_id", exp.ownerId)
      .order("started_at", { ascending: true })
      .range(from, to),
  );

  // Which sessions reached an offer step (either spec's offer ids).
  const reachedOffer = new Set<string>();
  if (offerIds.size > 0) {
    const views = await fetchAll<{ session_id: string }>((from, to) =>
      db
        .from("quiz_events")
        .select("session_id")
        .eq("quiz_id", exp.ownerId)
        .eq("event_type", "step_view")
        .in("step_id", Array.from(offerIds))
        .range(from, to),
    );
    for (const v of views) reachedOffer.add(v.session_id);
  }

  const arms: Record<"a" | "b", Arm> = {
    a: { sessions: 0, completions: 0, purchases: 0, revenue: 0 },
    b: { sessions: 0, completions: 0, purchases: 0, revenue: 0 },
  };
  let firstSeen: string | null = null;
  for (const s of sessions) {
    const v = s.variant_assignments?.[key];
    if (v !== "a" && v !== "b") continue; // only sessions that were in the experiment
    const arm = arms[v];
    arm.sessions++;
    if (reachedOffer.has(s.id)) arm.completions++;
    if (s.purchased) {
      arm.purchases++;
      arm.revenue += Number(s.purchase_value ?? 0);
    }
    if (!firstSeen) firstSeen = s.started_at;
  }

  const sig = significance(arms.a, arms.b);
  const totalPurchases = arms.a.purchases + arms.b.purchases;

  return NextResponse.json({
    experiment: {
      ownerId: exp.ownerId,
      ownerName: exp.ownerName,
      variantId: exp.variantId,
      variantName: exp.variantName,
      split_a: exp.splitA,
    },
    a: metrics(arms.a),
    b: metrics(arms.b),
    significance: sig,
    total_sessions: arms.a.sessions + arms.b.sessions,
    total_purchases: totalPurchases,
    has_offer_metric: offerIds.size > 0,
    started_at: firstSeen,
  });
}
