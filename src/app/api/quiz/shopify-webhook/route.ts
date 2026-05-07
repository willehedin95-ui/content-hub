// POST /api/quiz/shopify-webhook
//
// Shopify orders/create webhook handler. Receives every new order from a
// configured Shopify store, finds the matching quiz session via the
// `qz_sid` note attribute, marks the session as purchased, and fires a
// Meta CAPI Purchase event with quiz attribution as custom_data.
//
// Workspace routing: a workspace's `meta_config.shopify_webhook_secret`
// is used to verify the HMAC. The first workspace whose secret matches
// the request's HMAC owns this order.
//
// Security: HMAC-SHA256 verification per Shopify docs:
// https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook

import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendMessage } from "@/lib/telegram";

export const runtime = "nodejs"; // Need crypto + raw body access

// ---------------------------------------------------------------------------
// Types (subset of Shopify Order JSON we care about)
// ---------------------------------------------------------------------------

type ShopifyNoteAttribute = { name: string; value: string };

type ShopifyOrder = {
  id: number;
  order_number: number;
  email?: string | null;
  phone?: string | null;
  total_price: string;
  currency: string;
  created_at: string;
  landing_site?: string | null;
  browser_ip?: string | null;
  client_details?: { user_agent?: string | null } | null;
  customer?: { email?: string | null; phone?: string | null } | null;
  billing_address?: {
    first_name?: string | null;
    last_name?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country_code?: string | null;
  } | null;
  line_items?: Array<{ sku?: string | null; product_id?: number | string | null; title?: string }>;
  note_attributes?: ShopifyNoteAttribute[];
};

// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------

function verifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf-8").digest("base64");
  const a = Buffer.from(hmacHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Workspace lookup by HMAC
// ---------------------------------------------------------------------------

type WorkspaceMatch = {
  id: string;
  pixel_id: string;
  meta_config: Record<string, unknown>;
};

async function findWorkspaceByHmac(
  rawBody: string,
  hmacHeader: string | null,
): Promise<WorkspaceMatch | null> {
  const db = createServerSupabase();
  // Filter to workspaces that declared a quiz Shopify webhook secret. Stored
  // at meta_config.shopify_webhook_secret so each workspace can have its own.
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, meta_config")
    .not("meta_config->shopify_webhook_secret", "is", null);

  if (!workspaces) return null;

  for (const ws of workspaces) {
    const cfg = (ws.meta_config ?? {}) as Record<string, unknown>;
    const secret = typeof cfg.shopify_webhook_secret === "string" ? cfg.shopify_webhook_secret : "";
    const pixelId = typeof cfg.pixel_id === "string" ? cfg.pixel_id : "";
    if (!secret || !pixelId) continue;
    if (verifyHmac(rawBody, hmacHeader, secret)) {
      return { id: ws.id as string, pixel_id: pixelId, meta_config: cfg };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Note-attribute extraction
// ---------------------------------------------------------------------------

type QuizAttribution = {
  qz_sid?: string;
  qz_pain?: string;
  qz_breed?: string;
  qz_time?: string;
  qz_age?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  fbp?: string;
  fbc?: string;
};

function extractAttribution(order: ShopifyOrder): QuizAttribution {
  const attr: QuizAttribution = {};
  for (const na of order.note_attributes ?? []) {
    const name = na.name?.toLowerCase();
    if (!name) continue;
    if (name in {
      qz_sid: 1, qz_pain: 1, qz_breed: 1, qz_time: 1, qz_age: 1,
      utm_source: 1, utm_medium: 1, utm_campaign: 1, utm_content: 1, utm_term: 1,
      fbclid: 1, fbp: 1, fbc: 1,
    }) {
      (attr as Record<string, string>)[name] = na.value;
    }
  }
  // Fallback: parse landing_site URL if note_attributes missing
  if (!attr.qz_sid && order.landing_site) {
    try {
      const url = new URL(order.landing_site, "https://placeholder.com");
      const params = url.searchParams;
      const get = (k: string) => params.get(k) ?? undefined;
      attr.qz_sid ??= get("qz_sid") ?? get("utm_content");
      attr.qz_pain ??= get("qz_pain") ?? get("utm_term");
      attr.qz_breed ??= get("qz_breed");
      attr.qz_time ??= get("qz_time");
      attr.qz_age ??= get("qz_age");
      attr.utm_source ??= get("utm_source");
      attr.utm_medium ??= get("utm_medium");
      attr.utm_campaign ??= get("utm_campaign");
      attr.fbclid ??= get("fbclid");
    } catch { /* skip */ }
  }
  return attr;
}

// ---------------------------------------------------------------------------
// Meta CAPI Purchase send
// ---------------------------------------------------------------------------

function sha256Lower(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function sendCAPIPurchase(
  pixelId: string,
  token: string,
  order: ShopifyOrder,
  attr: QuizAttribution,
): Promise<{ ok: boolean; error?: string; events_received?: number }> {
  const userData: Record<string, unknown> = {};
  const email = order.email || order.customer?.email;
  if (email) userData.em = [sha256Lower(email)];
  const phone = order.phone || order.customer?.phone;
  if (phone) userData.ph = [sha256Lower(phone.replace(/\D/g, ""))];
  if (order.billing_address) {
    const b = order.billing_address;
    if (b.first_name) userData.fn = [sha256Lower(b.first_name)];
    if (b.last_name) userData.ln = [sha256Lower(b.last_name)];
    if (b.city) userData.ct = [sha256Lower(b.city)];
    if (b.zip) userData.zp = [sha256Lower(b.zip.replace(/\s/g, ""))];
    if (b.country_code) userData.country = [sha256Lower(b.country_code)];
  }
  if (order.browser_ip) userData.client_ip_address = order.browser_ip;
  if (order.client_details?.user_agent) userData.client_user_agent = order.client_details.user_agent;
  if (attr.fbp) userData.fbp = attr.fbp;
  if (attr.fbc) {
    userData.fbc = attr.fbc;
  } else if (attr.fbclid) {
    userData.fbc = `fb.1.${Date.parse(order.created_at)}.${attr.fbclid}`;
  }

  const customData: Record<string, unknown> = {
    value: parseFloat(order.total_price),
    currency: order.currency,
    content_ids: order.line_items?.map((li) => li.sku || String(li.product_id)).filter(Boolean) ?? [],
    content_type: "product",
  };
  // Quiz attribution surfaces as custom data so reports can split by pain/breed.
  if (attr.qz_sid) customData.quiz_session_id = attr.qz_sid;
  if (attr.qz_pain) customData.quiz_primary_pain = attr.qz_pain;
  if (attr.qz_breed) customData.quiz_breed = attr.qz_breed;
  if (attr.qz_time) customData.quiz_time_per_day = attr.qz_time;
  if (attr.qz_age) customData.quiz_age = attr.qz_age;
  if (attr.utm_campaign) customData.utm_campaign = attr.utm_campaign;

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.parse(order.created_at) / 1000),
        event_id: `shopify_${order.id}`,
        action_source: "website",
        ...(order.landing_site ? { event_source_url: order.landing_site } : {}),
        user_data: userData,
        custom_data: customData,
      },
    ],
    access_token: token,
  };

  const res = await fetch(`https://graph.facebook.com/v22.0/${pixelId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `CAPI ${res.status}: ${text.slice(0, 300)}` };
  }
  const json = (await res.json()) as { events_received?: number };
  return { ok: true, events_received: json.events_received };
}

// ---------------------------------------------------------------------------
// Telegram purchase notification
// ---------------------------------------------------------------------------

function isValpakademinOrder(order: ShopifyOrder): boolean {
  return (order.line_items ?? []).some((li) =>
    (li.title ?? "").toLowerCase().includes("valpakademin"),
  );
}

function buildPurchaseMessage(
  order: ShopifyOrder,
  attr: QuizAttribution,
  shopDomain: string,
  sessionMatched: boolean,
): string {
  const lines: string[] = [];
  lines.push(`Köp av Valpakademin`);
  lines.push("");

  const value = parseFloat(order.total_price);
  const valueStr = Number.isFinite(value)
    ? `${Math.round(value)} ${order.currency}`
    : order.total_price;
  lines.push(`Order #${order.order_number} - ${valueStr}`);

  const firstName = order.billing_address?.first_name ?? "";
  const lastName = order.billing_address?.last_name ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  const email = order.email ?? order.customer?.email ?? "";
  if (fullName || email) {
    const who = [fullName, email].filter(Boolean).join(" - ");
    lines.push(who);
  }

  lines.push("");

  // Source detection: quiz session match wins. If qz_sid was present and
  // resolved a session, this came through the quiz funnel. Otherwise it's
  // a direct LP purchase (or some other path - utm_source still surfaced).
  if (sessionMatched && attr.qz_sid) {
    lines.push(`Källa: Quiz`);
    if (attr.qz_pain) lines.push(`- Primärt problem: ${attr.qz_pain}`);
    if (attr.qz_breed) lines.push(`- Ras: ${attr.qz_breed}`);
    if (attr.qz_age) lines.push(`- Ålder: ${attr.qz_age}`);
    if (attr.qz_time) lines.push(`- Tid per dag: ${attr.qz_time}`);
  } else {
    lines.push(`Källa: Direkt LP`);
    if (attr.utm_source) lines.push(`- UTM source: ${attr.utm_source}`);
    if (attr.utm_campaign) lines.push(`- UTM campaign: ${attr.utm_campaign}`);
    if (attr.utm_medium) lines.push(`- UTM medium: ${attr.utm_medium}`);
  }

  if (shopDomain) {
    lines.push("");
    lines.push(`https://${shopDomain}/admin/orders/${order.id}`);
  }

  return lines.join("\n");
}

async function sendPurchaseTelegram(
  order: ShopifyOrder,
  attr: QuizAttribution,
  shopDomain: string,
  sessionMatched: boolean,
): Promise<void> {
  if (!isValpakademinOrder(order)) return;
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (!chatId) return;
  const text = buildPurchaseMessage(order, attr, shopDomain, sessionMatched);
  try {
    await sendMessage(chatId, text, { disable_web_page_preview: true });
  } catch (err) {
    console.error("[shopify-webhook] Telegram send failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Read raw body for HMAC verification (must read before JSON parse)
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shopDomain = req.headers.get("x-shopify-shop-domain") ?? "";

  if (topic !== "orders/create" && topic !== "orders/paid") {
    // Acknowledge but ignore non-order topics
    return NextResponse.json({ ok: true, ignored: topic }, { status: 200 });
  }

  const ws = await findWorkspaceByHmac(rawBody, hmacHeader);
  if (!ws) {
    console.warn("[shopify-webhook] HMAC verification failed", { shopDomain });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody) as ShopifyOrder;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const attr = extractAttribution(order);
  const db = createServerSupabase();

  // Idempotency: skip if we've already processed this order
  const { data: alreadyDone } = await db
    .from("quiz_sessions")
    .select("id")
    .eq("purchase_order_id", String(order.id))
    .maybeSingle();
  if (alreadyDone) {
    return NextResponse.json({ ok: true, idempotent: true }, { status: 200 });
  }

  // Find quiz session by qz_sid (if present)
  let sessionId: string | null = attr.qz_sid ?? null;
  if (sessionId) {
    const { data: session } = await db
      .from("quiz_sessions")
      .select("id, quiz_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) sessionId = null;
  }

  // Update session with purchase + log a 'purchase' event for the funnel chart
  let sessionUpdated = false;
  if (sessionId) {
    const { error: updErr } = await db
      .from("quiz_sessions")
      .update({
        purchased: true,
        purchase_order_id: String(order.id),
        purchase_order_number: order.order_number,
        purchase_value: parseFloat(order.total_price),
        purchase_currency: order.currency,
        purchased_at: order.created_at,
        purchase_meta: { attr, shop_domain: shopDomain, line_items: order.line_items?.length ?? 0 },
      })
      .eq("id", sessionId);
    if (!updErr) sessionUpdated = true;

    // Best-effort funnel-chart event
    const { data: sessionRow } = await db
      .from("quiz_sessions")
      .select("quiz_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionRow?.quiz_id) {
      await db.from("quiz_events").insert({
        session_id: sessionId,
        quiz_id: sessionRow.quiz_id as string,
        event_type: "purchase",
        meta: {
          order_id: String(order.id),
          order_number: order.order_number,
          value: parseFloat(order.total_price),
          currency: order.currency,
        },
      });
    }
  }

  // Send Meta CAPI Purchase event
  const token = process.env.META_SYSTEM_USER_TOKEN;
  let capiResult: { ok: boolean; error?: string; events_received?: number } = { ok: false, error: "no token" };
  if (token) {
    capiResult = await sendCAPIPurchase(ws.pixel_id, token, order, attr);
  }

  // Log CAPI attempt to meta_capi_events. Schema matches syncOrdersToCAPI's
  // upsert in meta-capi.ts so reconciliation queries can union across both
  // sources (webhook-driven vs cron-sync). onConflict on event_id keeps the
  // table idempotent on Shopify's webhook retries.
  //
  // Wrapped in try/catch: a logging failure must NOT cause the webhook to
  // 500. Shopify would retry the order and we'd risk attribution duplication
  // or noisy errors. Logging is best-effort - the actual CAPI POST already
  // succeeded or failed by this point.
  try {
    await db.from("meta_capi_events").upsert(
      {
        event_id: `shopify_${order.id}`,
        event_name: "Purchase",
        shopify_order_id: order.id,
        shopify_order_number: order.order_number,
        pixel_id: ws.pixel_id,
        event_time: new Date(order.created_at).toISOString(),
        value: parseFloat(order.total_price),
        currency: order.currency,
        status: capiResult.ok ? "sent" : "failed",
        response_data: capiResult.ok ? { events_received: capiResult.events_received } : null,
        error_message: capiResult.ok ? null : capiResult.error ?? null,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "event_id" },
    );
  } catch (logErr) {
    console.error("[shopify-webhook] meta_capi_events log failed:", logErr);
  }

  // Telegram notification for Valpakademin orders. Source = Quiz when we
  // resolved a quiz session via qz_sid, otherwise Direct LP (or other path
  // surfaced via utm_*).
  await sendPurchaseTelegram(order, attr, shopDomain, sessionUpdated);

  return NextResponse.json({
    ok: true,
    workspace_id: ws.id,
    quiz_session_id: sessionId,
    session_updated: sessionUpdated,
    capi: capiResult,
    attribution: attr,
  });
}
