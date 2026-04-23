// POST /api/quiz/klaviyo-subscribe
// Proxies Klaviyo list-subscribe calls from the quiz runtime.
// Hides the Klaviyo API key from the published page.
//
// CONCERN: KLAVIYO_API_KEY is not yet in .env.local (no Klaviyo setup for quizzes).
// If not configured, email is saved to quiz_sessions.email only.
// To enable: add KLAVIYO_API_KEY to .env.local with the workspace Klaviyo key.
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

  // Attempt Klaviyo subscribe if API key is configured
  const klaviyoKey = process.env.KLAVIYO_API_KEY;
  if (!klaviyoKey) {
    // No Klaviyo key configured - email saved to DB only (see CONCERN above)
    console.info("[quiz/klaviyo-subscribe] No KLAVIYO_API_KEY; email saved to session only");
    return NextResponse.json(
      { ok: true, klaviyo: false, reason: "KLAVIYO_API_KEY not configured" },
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
      // Return partial success - email is already saved to DB
      return NextResponse.json(
        { ok: true, klaviyo: false, reason: `Klaviyo returned ${res.status}` },
        { headers: corsHeaders },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[quiz/klaviyo-subscribe] fetch error:", msg);
    return NextResponse.json(
      { ok: true, klaviyo: false, reason: msg },
      { headers: corsHeaders },
    );
  }

  return NextResponse.json({ ok: true, klaviyo: true }, { headers: corsHeaders });
}
