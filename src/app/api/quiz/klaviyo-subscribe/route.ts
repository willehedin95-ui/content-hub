// POST /api/quiz/klaviyo-subscribe
// Proxies Klaviyo list-subscribe calls from the quiz runtime.
// Hides the Klaviyo API key from the published page.
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
};

/** Resolve the Klaviyo API key for the workspace owning this session's quiz. */
async function getKlaviyoKeyForSession(
  db: ReturnType<typeof createServerSupabase>,
  sessionId: string,
): Promise<{ key: string | null; slug: string | null }> {
  const { data: session } = await db
    .from("quiz_sessions")
    .select("quiz_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.quiz_id) return { key: null, slug: null };

  const { data: quiz } = await db
    .from("quizzes")
    .select("workspace_id")
    .eq("id", session.quiz_id as string)
    .maybeSingle();
  if (!quiz?.workspace_id) return { key: null, slug: null };

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
  return { key: (slug && keyBySlug[slug]?.trim()) || null, slug };
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

  // Basic email validation
  if (!body.email.includes("@")) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400, headers: corsHeaders },
    );
  }

  const db = createServerSupabase();

  // Always store email on the session row
  await db
    .from("quiz_sessions")
    .update({ email: body.email })
    .eq("id", body.session_id);

  // Resolve the workspace-specific Klaviyo key (session -> quiz -> workspace)
  const { key: klaviyoKey, slug } = await getKlaviyoKeyForSession(db, body.session_id);
  if (!klaviyoKey) {
    console.error(
      `[quiz/klaviyo-subscribe] No Klaviyo API key for workspace "${slug ?? "unknown"}" - email saved to session only`,
    );
    return NextResponse.json(
      { ok: false, klaviyo: false, reason: `No Klaviyo API key configured for workspace ${slug ?? "unknown"}` },
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
                subscriptions: {
                  email: {
                    marketing: { consent: "SUBSCRIBED" },
                  },
                },
              },
            },
          ],
        },
        historical_import: false,
      },
      relationships: {
        list: {
          data: { type: "list", id: body.listId },
        },
      },
    },
  };

  try {
    const res = await fetch(
      "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/",
      {
        method: "POST",
        headers: {
          Authorization: `Klaviyo-API-Key ${klaviyoKey}`,
          revision: "2024-10-15",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(klaviyoPayload),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[quiz/klaviyo-subscribe] Klaviyo error:", res.status, errText);
      // Honest failure signal (email is still saved on the session row)
      return NextResponse.json(
        { ok: false, klaviyo: false, reason: `Klaviyo returned ${res.status}` },
        { headers: corsHeaders },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[quiz/klaviyo-subscribe] fetch error:", msg);
    return NextResponse.json(
      { ok: false, klaviyo: false, reason: msg },
      { headers: corsHeaders },
    );
  }

  return NextResponse.json({ ok: true, klaviyo: true }, { headers: corsHeaders });
}
