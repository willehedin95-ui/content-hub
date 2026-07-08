// POST /api/quiz/klaviyo-subscribe
// Proxies Klaviyo calls from the quiz runtime. Hides the Klaviyo API key from
// the published page. Does three things (the last two are best-effort):
//   1. Subscribe the email to the configured list.
//   2. Upsert the profile with the visitor's quiz answers as custom properties
//      (so Klaviyo segments/flows can target by answer).
//   3. Fire a "Quiz Completed" event with those answers (so a flow can trigger).
//
// Answers are derived server-side from the session's own `quiz_events` (no
// runtime change / republish needed - works for every already-published quiz).
// If the caller passes `properties`, those are merged in and win (that path
// lets the runtime send text-input answers, which aren't in quiz_events).
//
// The API key is resolved per workspace (session -> quiz -> workspace.slug):
//   doginwork                 -> KLAVIYO_DOGINWORK_API_KEY
//   swedishbalance/happysleep -> KLAVIYO_SB_API_KEY
// Other workspaces have no Klaviyo account wired up - subscribe returns
// ok:false (email is still saved on the session row).
//
// CORS-friendly - called from CF Pages domains.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getCORSHeaders, handleOptions } from "../_cors";

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return handleOptions(origin);
}

type SubscribeBody = {
  session_id: string;
  email: string;
  listId: string;
  // Optional: extra answers keyed by variable name (e.g. text inputs the
  // runtime resolved but that aren't stored as option events). Merged over the
  // server-derived answers.
  properties?: Record<string, string>;
};

const KLAVIYO_REVISION = "2024-10-15";

type QuizContext = {
  key: string | null;
  slug: string | null;
  quizId: string | null;
  quizName: string | null;
  quizData: QuizDataLite | null;
};

// ── Minimal quiz-spec shape needed to map option ids -> {variable, value} ─────
type QuizNodeLite = {
  kind?: string;
  subEls?: Array<{
    kind?: string;
    variable?: string;
    options?: Array<{ id: string; label?: string; value?: string }>;
  }>;
};
type QuizDataLite = { nodes?: Record<string, QuizNodeLite> };
type AnswerEvent = { option_id: string | null };

/** Resolve Klaviyo key + quiz context for a session in one pass. */
async function getQuizContext(
  db: ReturnType<typeof createServerSupabase>,
  sessionId: string,
): Promise<QuizContext> {
  const empty: QuizContext = { key: null, slug: null, quizId: null, quizName: null, quizData: null };

  const { data: session } = await db
    .from("quiz_sessions")
    .select("quiz_id")
    .eq("id", sessionId)
    .maybeSingle();
  const quizId = (session?.quiz_id as string | undefined) ?? null;
  if (!quizId) return empty;

  const { data: quiz } = await db
    .from("quizzes")
    .select("workspace_id, name, data")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz?.workspace_id) return { ...empty, quizId };

  const { data: ws } = await db
    .from("workspaces")
    .select("slug")
    .eq("id", quiz.workspace_id as string)
    .maybeSingle();
  const slug = (ws?.slug as string | undefined) ?? null;

  const keyBySlug: Record<string, string | undefined> = {
    doginwork: process.env.KLAVIYO_DOGINWORK_API_KEY,
    swedishbalance: process.env.KLAVIYO_SB_API_KEY,
    happysleep: process.env.KLAVIYO_SB_API_KEY,
  };

  return {
    key: (slug && keyBySlug[slug]?.trim()) || null,
    slug,
    quizId,
    quizName: (quiz.name as string | undefined) ?? null,
    quizData: (quiz.data as QuizDataLite | undefined) ?? null,
  };
}

/** Map the session's answer events to { variableName: value } using the quiz
 *  spec. Multi-select answers are joined; commit-gate answers are skipped. */
function deriveAnswerProperties(
  events: AnswerEvent[],
  quizData: QuizDataLite | null,
): Record<string, string> {
  if (!quizData?.nodes) return {};
  const optMeta = new Map<string, { variable: string; value: string }>();
  for (const node of Object.values(quizData.nodes)) {
    if (node.kind !== "step") continue;
    for (const el of node.subEls ?? []) {
      if (el.kind !== "question" || !el.variable) continue;
      for (const o of el.options ?? []) {
        optMeta.set(o.id, { variable: el.variable, value: o.value || o.label || "" });
      }
    }
  }

  const acc = new Map<string, string[]>();
  for (const e of events) {
    const oid = e.option_id;
    if (!oid || oid.startsWith("commit_")) continue;
    const m = optMeta.get(oid);
    if (!m || !m.value) continue;
    const arr = acc.get(m.variable) ?? [];
    if (!arr.includes(m.value)) arr.push(m.value);
    acc.set(m.variable, arr);
  }

  const out: Record<string, string> = {};
  for (const [k, v] of acc.entries()) out[k] = v.join(", ");
  return out;
}

function klaviyoHeaders(key: string) {
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: KLAVIYO_REVISION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Best-effort: upsert profile properties + fire a "Quiz Completed" event.
 *  Failures are logged, never thrown - the email subscribe is the critical path. */
async function enrichKlaviyoProfile(
  key: string,
  email: string,
  answers: Record<string, string>,
  meta: Record<string, string>,
): Promise<{ profile: boolean; event: boolean }> {
  const props = { ...answers, ...meta };
  const result = { profile: false, event: false };

  // 1. Persist answers on the profile (segmentable).
  try {
    const res = await fetch("https://a.klaviyo.com/api/profile-import", {
      method: "POST",
      headers: klaviyoHeaders(key),
      body: JSON.stringify({
        data: { type: "profile", attributes: { email, properties: props } },
      }),
    });
    result.profile = res.ok;
    if (!res.ok) console.error("[klaviyo-subscribe] profile-import", res.status, await res.text());
  } catch (err) {
    console.error("[klaviyo-subscribe] profile-import error:", err instanceof Error ? err.message : err);
  }

  // 2. Fire an event so flows can trigger on the quiz.
  try {
    const res = await fetch("https://a.klaviyo.com/api/events/", {
      method: "POST",
      headers: klaviyoHeaders(key),
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            metric: { data: { type: "metric", attributes: { name: "Quiz Completed" } } },
            profile: { data: { type: "profile", attributes: { email } } },
            properties: props,
          },
        },
      }),
    });
    result.event = res.ok;
    if (!res.ok) console.error("[klaviyo-subscribe] event", res.status, await res.text());
  } catch (err) {
    console.error("[klaviyo-subscribe] event error:", err instanceof Error ? err.message : err);
  }

  return result;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCORSHeaders(origin);

  const body = (await req.json().catch(() => null)) as SubscribeBody | null;

  if (!body?.session_id || !body.email || !body.listId) {
    return NextResponse.json(
      { error: "session_id, email, and listId are required" },
      { status: 400, headers: corsHeaders },
    );
  }
  if (!body.email.includes("@")) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400, headers: corsHeaders },
    );
  }

  const db = createServerSupabase();

  // Always store email on the session row.
  await db.from("quiz_sessions").update({ email: body.email }).eq("id", body.session_id);

  const ctx = await getQuizContext(db, body.session_id);
  if (!ctx.key) {
    console.error(
      `[quiz/klaviyo-subscribe] No Klaviyo API key for workspace "${ctx.slug ?? "unknown"}" - email saved to session only`,
    );
    return NextResponse.json(
      { ok: false, klaviyo: false, reason: `No Klaviyo API key configured for workspace ${ctx.slug ?? "unknown"}` },
      { headers: corsHeaders },
    );
  }

  // Klaviyo v3 subscribe API
  // https://developers.klaviyo.com/en/reference/subscribe_profiles
  const klaviyoPayload = {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: body.email,
                subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
              },
            },
          ],
        },
        historical_import: false,
      },
      relationships: { list: { data: { type: "list", id: body.listId } } },
    },
  };

  try {
    const res = await fetch(
      "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/",
      { method: "POST", headers: klaviyoHeaders(ctx.key), body: JSON.stringify(klaviyoPayload) },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error("[quiz/klaviyo-subscribe] Klaviyo error:", res.status, errText);
      return NextResponse.json(
        { ok: false, klaviyo: false, reason: `Klaviyo returned ${res.status}` },
        { headers: corsHeaders },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[quiz/klaviyo-subscribe] fetch error:", msg);
    return NextResponse.json({ ok: false, klaviyo: false, reason: msg }, { headers: corsHeaders });
  }

  // ── Best-effort enrichment: answers -> profile properties + event ──────────
  let enriched: { profile: boolean; event: boolean } = { profile: false, event: false };
  try {
    const { data: events } = await db
      .from("quiz_events")
      .select("option_id")
      .eq("session_id", body.session_id)
      .eq("event_type", "answer");
    const derived = deriveAnswerProperties((events as AnswerEvent[]) ?? [], ctx.quizData);
    const answers = { ...derived, ...(body.properties ?? {}) };
    if (Object.keys(answers).length > 0 || ctx.quizName) {
      const meta: Record<string, string> = {};
      if (ctx.quizName) meta["Quiz Name"] = ctx.quizName;
      enriched = await enrichKlaviyoProfile(ctx.key, body.email, answers, meta);
    }
  } catch (err) {
    console.error("[quiz/klaviyo-subscribe] enrichment error:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true, klaviyo: true, enriched }, { headers: corsHeaders });
}
