import { createHash } from "crypto";
import { withRetry, isTransientError } from "./retry";
import { createServerSupabase } from "./supabase";
import { ShopifyOrderFull, fetchOrdersFullSince } from "./shopify";

const META_API_BASE = "https://graph.facebook.com/v22.0";

// ---- Hashing ----

function sha256(value: string): string {
  return createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

function hashIfPresent(value: string | null | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  return [sha256(value)];
}

// ---- Event types ----

interface CAPIEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  user_data: Record<string, unknown>;
  custom_data: Record<string, unknown>;
}

// ---- Event building ----

function buildEventFromOrder(order: ShopifyOrderFull): CAPIEvent {
  const billing = order.billing_address;

  const userData: Record<string, unknown> = {};

  // Hash all PII fields per Meta's requirements
  const email = order.email || order.customer?.email;
  if (email) userData.em = hashIfPresent(email);

  const phone = order.phone || order.customer?.phone;
  if (phone) userData.ph = hashIfPresent(phone.replace(/\D/g, ""));

  if (billing) {
    if (billing.first_name) userData.fn = hashIfPresent(billing.first_name);
    if (billing.last_name) userData.ln = hashIfPresent(billing.last_name);
    if (billing.city) userData.ct = hashIfPresent(billing.city);
    if (billing.province) userData.st = hashIfPresent(billing.province);
    if (billing.zip) userData.zp = hashIfPresent(billing.zip?.replace(/\s/g, ""));
    if (billing.country_code) userData.country = hashIfPresent(billing.country_code);
  }

  // Non-hashed fields
  if (order.browser_ip) userData.client_ip_address = order.browser_ip;
  if (order.client_details?.user_agent) userData.client_user_agent = order.client_details.user_agent;

  // Extract fbclid from landing_site to build fbc parameter
  if (order.landing_site) {
    try {
      const url = new URL(order.landing_site, "https://placeholder.com");
      const fbclid = url.searchParams.get("fbclid");
      if (fbclid) {
        userData.fbc = `fb.1.${Date.parse(order.created_at)}.${fbclid}`;
      }
    } catch { /* skip */ }
  }

  const contentIds = order.line_items
    ?.map((li) => li.sku || String(li.product_id))
    .filter(Boolean) ?? [];

  return {
    event_name: "Purchase",
    event_time: Math.floor(Date.parse(order.created_at) / 1000),
    event_id: `shopify_${order.id}`,
    action_source: "website",
    user_data: userData,
    custom_data: {
      value: parseFloat(order.total_price),
      currency: order.currency,
      content_ids: contentIds,
      content_type: "product",
    },
  };
}

// ---- Sending ----

interface CAPIResponse {
  events_received: number;
  messages?: string[];
  fbtrace_id?: string;
}

async function sendEventsBatch(
  pixelId: string,
  events: CAPIEvent[],
  token: string
): Promise<CAPIResponse> {
  return withRetry(
    async () => {
      const res = await fetch(`${META_API_BASE}/${pixelId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: events,
          access_token: token,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Meta CAPI error (${res.status}): ${text.slice(0, 300)}`);
      }

      return (await res.json()) as CAPIResponse;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

// ---- Sync orchestrator ----

export interface CAPISyncResult {
  sent: number;
  skipped: number;
  errors: number;
  details?: string[];
}

export async function syncOrdersToCAPI(daysSince: number): Promise<CAPISyncResult> {
  const db = createServerSupabase();

  // Get pixel ID and token
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();

  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const pixelId = settings.meta_pixel_id as string;
  if (!pixelId) throw new Error("Meta Pixel ID not configured in settings");

  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN not set");

  // Fetch orders
  const since = new Date(Date.now() - daysSince * 86400000).toISOString();
  const orders = await fetchOrdersFullSince(since);

  if (orders.length === 0) {
    return { sent: 0, skipped: 0, errors: 0 };
  }

  // Get already-sent order IDs
  const orderIds = orders.map((o) => `shopify_${o.id}`);
  const { data: existingEvents } = await db
    .from("meta_capi_events")
    .select("event_id")
    .in("event_id", orderIds);

  const sentIds = new Set((existingEvents ?? []).map((e) => e.event_id));

  // Filter to unsent orders
  const unsent = orders.filter((o) => !sentIds.has(`shopify_${o.id}`));

  if (unsent.length === 0) {
    return { sent: 0, skipped: orders.length, errors: 0 };
  }

  // Build events
  const events = unsent.map(buildEventFromOrder);

  // Send in batches of 100 (Meta limit is 1000, but smaller batches are safer)
  let sent = 0;
  let errors = 0;
  const details: string[] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchOrders = unsent.slice(i, i + BATCH_SIZE);

    try {
      const response = await sendEventsBatch(pixelId, batch, token);

      // Record successful sends
      const rows = batchOrders.map((order, idx) => ({
        event_id: batch[idx].event_id,
        event_name: "Purchase",
        shopify_order_id: order.id,
        shopify_order_number: order.order_number,
        pixel_id: pixelId,
        event_time: new Date(order.created_at).toISOString(),
        value: parseFloat(order.total_price),
        currency: order.currency,
        status: "sent",
        response_data: response,
        sent_at: new Date().toISOString(),
      }));

      await db.from("meta_capi_events").upsert(rows, { onConflict: "event_id" });
      sent += batch.length;
    } catch (err) {
      errors += batch.length;
      const msg = err instanceof Error ? err.message : "Unknown error";
      details.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${msg}`);

      // Record failed sends
      const rows = batchOrders.map((order, idx) => ({
        event_id: batch[idx].event_id,
        event_name: "Purchase",
        shopify_order_id: order.id,
        shopify_order_number: order.order_number,
        pixel_id: pixelId,
        event_time: new Date(order.created_at).toISOString(),
        value: parseFloat(order.total_price),
        currency: order.currency,
        status: "failed",
        error_message: msg,
      }));

      await db.from("meta_capi_events").upsert(rows, { onConflict: "event_id" });
    }
  }

  return {
    sent,
    skipped: sentIds.size,
    errors,
    ...(details.length > 0 ? { details } : {}),
  };
}

// ---- Stats ----

export async function getCAPIStats(): Promise<{
  total: number;
  sent: number;
  failed: number;
  pending: number;
}> {
  const db = createServerSupabase();

  const [totalResult, sentResult, failedResult] = await Promise.all([
    db.from("meta_capi_events").select("id", { count: "exact", head: true }),
    db.from("meta_capi_events").select("id", { count: "exact", head: true }).eq("status", "sent"),
    db.from("meta_capi_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  const total = totalResult.count ?? 0;
  const sent = sentResult.count ?? 0;
  const failed = failedResult.count ?? 0;

  return {
    total,
    sent,
    failed,
    pending: total - sent - failed,
  };
}
