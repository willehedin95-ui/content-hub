import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { trackedCronRoute } from "@/lib/cron-tracker";
import {
  fetchDispatchedDeliveries,
  primaryTrackingNumber,
  hasCollagenRow,
  isShelflessConfigured,
  type ShelflessDelivery,
} from "@/lib/shelfless";
import { fetchParcelStatus, isBringConfigured } from "@/lib/bring";
import { trackKlaviyoEvent, isKlaviyoEventsConfigured, type KlaviyoBrand } from "@/lib/klaviyo-events";

export const maxDuration = 300;

/**
 * Metricen floden triggar pa i Klaviyo. Skapas automatiskt vid forsta eventet.
 */
const PICKUP_METRIC = "Package Picked Up";

/** Hur langt bak vi letar efter nya paket att borja bevaka. */
const LOOKBACK_DAYS = 21;

/** Hur manga paket vi slar upp mot Bring per korning (API-hansyn + maxDuration). */
const BRING_LOOKUPS_PER_RUN = 120;

/** Paus mellan Bring-anrop. */
const BRING_DELAY_MS = 250;

/**
 * Sluta bevaka ett paket som aldrig landar nagonstans. 45 dagar ar val tilltaget:
 * matt p90 fran avsant till uthamtat ar 6,3 dygn och Bring returnerar ohamtade
 * paket efter ca 8 dagar.
 *
 * Spar ar mattet ALDER, inte antal kontroller. Forsta versionen raknade
 * kontroller och var skriven som om cronen gick en gang per dygn. Den gar varje
 * timme, sa taket slog efter 60 timmar (2,5 dygn) i stallet for 45 dagar.
 * Utfall: 102 av 104 oppna paket slutade bevakas och eventen foll fran 11 om
 * dagen till noll pa fyra dagar (uppmatt 2026-09-21). En raknare kodar in
 * cron-frekvensen implicit, en aldersgrans gor det inte.
 */
const MAX_TRACKING_DAYS = 45;

/**
 * Skicka INTE event for paket som hamtades ut for lange sedan.
 *
 * Nar bevakningen startar ar tabellen tom och forsta korningen upptacker hela
 * backloggen - vid uppsattningen 2026-09-14 var det 73 redan uthamtade paket,
 * vissa flera dygn gamla. Utan den har sparren skulle de alla fa ett "hur var
 * det att handla hos oss?" samtidigt, om nagon rakat aktivera flodet. Ett dygns
 * fonster racker med gott marginal: cronen gar varje timme.
 */
const MAX_EVENT_AGE_HOURS = 36;

/**
 * Avsandarprofil i Shelfless -> Klaviyo-konto.
 * 1623 = SwedishBalance, 1624 = Renew (nedlagt 2026-08-21, bevakas ej).
 * Envana far en egen profil sa fort forsta ordern gar genom lagret; tills dess
 * fangas den av ordernummer-prefixet nedan.
 */
const SENDER_PROFILE_BRAND: Record<number, KlaviyoBrand> = {
  1623: "swedishbalance",
};

/**
 * Ordernummer-prefix -> brand. Envana-ordrar heter EN1007, EN1008, ...
 * SwedishBalance anvander rena siffror (59922).
 */
function brandFromDelivery(d: ShelflessDelivery): KlaviyoBrand | null {
  const order = (d.orderNumber ?? "").trim().toUpperCase();
  if (order.startsWith("EN")) return "envana";
  if (order.startsWith("R")) return null; // Renew, nedlagt
  if (d.senderProfileId && SENDER_PROFILE_BRAND[d.senderProfileId]) {
    return SENDER_PROFILE_BRAND[d.senderProfileId];
  }
  if (/^\d+$/.test(order)) return "swedishbalance";
  return null;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function handleCron(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isManual = req.nextUrl.searchParams.get("manual") === "true";
  if (!isManual && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Torrkorning: gor allt UTOM att skicka till Klaviyo. Anvand for att se vad
  // en skarp korning skulle ha gjort innan flodet ar pasatt.
  const dryRun = req.nextUrl.searchParams.get("dry") === "true";

  if (!isShelflessConfigured()) {
    return NextResponse.json({ error: "Shelfless not configured" }, { status: 503 });
  }
  if (!isBringConfigured()) {
    return NextResponse.json({ error: "Bring not configured" }, { status: 503 });
  }

  const db = createServerSupabase();
  const errors: Array<{ step: string; ref?: string; error: string }> = [];

  // ---------------------------------------------------------------------------
  // 1. Registrera nya utskickade paket
  // ---------------------------------------------------------------------------
  let discovered = 0;
  let skippedNoTracking = 0;
  let skippedNoBrand = 0;

  try {
    const deliveries = await fetchDispatchedDeliveries({ shippedFrom: daysAgo(LOOKBACK_DAYS) });

    const rows: Array<Record<string, unknown>> = [];
    for (const d of deliveries) {
      const tracking = primaryTrackingNumber(d);
      if (!tracking) {
        skippedNoTracking += 1;
        continue;
      }
      const brand = brandFromDelivery(d);
      if (!brand) {
        skippedNoBrand += 1;
        continue;
      }
      const email = d.deliveryNotificationDetails?.email?.trim() || null;

      rows.push({
        tracking_number: tracking,
        order_number: d.orderNumber,
        external_id: d.externalId ?? null,
        brand,
        email,
        shipped_at: d.shippedDate ?? null,
        has_collagen: hasCollagenRow(d),
      });
    }

    if (rows.length > 0) {
      // ignoreDuplicates: en rad som redan bevakas ska INTE fa sina
      // status-/eventfalt nollstallda av upptackten.
      const { error } = await db
        .from("parcel_tracking")
        .upsert(rows, { onConflict: "tracking_number", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    discovered = rows.length;
  } catch (err) {
    errors.push({ step: "discover", error: err instanceof Error ? err.message : String(err) });
  }

  // ---------------------------------------------------------------------------
  // 2. Slag upp oppna paket mot Bring
  // ---------------------------------------------------------------------------
  let checked = 0;
  let nowDelivered = 0;
  let nowReturned = 0;
  let eventsSent = 0;
  let eventsSkippedNoEmail = 0;
  let eventsSkippedTooOld = 0;

  // Bevakningsfonster. Rader utan shipped_at (Shelfless satte aldrig datumet)
  // faller tillbaka pa created_at sa de inte bevakas i all evighet.
  const trackingCutoff = new Date(Date.now() - MAX_TRACKING_DAYS * 86_400_000).toISOString();

  const { data: open, error: openErr } = await db
    .from("parcel_tracking")
    .select("*")
    .is("klaviyo_event_sent_at", null)
    .in("status", ["in_transit", "ready_for_pickup"])
    .or(
      `shipped_at.gte.${trackingCutoff},and(shipped_at.is.null,created_at.gte.${trackingCutoff})`
    )
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(BRING_LOOKUPS_PER_RUN);

  if (openErr) {
    errors.push({ step: "load_open", error: openErr.message });
  }

  for (const row of open ?? []) {
    const trackingNumber = row.tracking_number as string;
    checked += 1;

    let status;
    try {
      status = await fetchParcelStatus(trackingNumber);
    } catch (err) {
      errors.push({
        step: "bring",
        ref: trackingNumber,
        error: err instanceof Error ? err.message : String(err),
      });
      await db
        .from("parcel_tracking")
        .update({ last_checked_at: new Date().toISOString(), check_count: (row.check_count ?? 0) + 1 })
        .eq("id", row.id);
      await sleep(BRING_DELAY_MS);
      continue;
    }

    const update: Record<string, unknown> = {
      last_checked_at: new Date().toISOString(),
      check_count: (row.check_count ?? 0) + 1,
      ready_for_pickup_at: status.readyForPickupAt,
      delivered_at: status.deliveredAt,
      returned_at: status.returnedAt,
      pickup_point: status.pickupPoint,
      status: status.phase === "unknown" ? "in_transit" : status.phase,
    };

    // Uthamtat -> skicka eventet som triggar recensionsflodet.
    if (status.phase === "delivered") {
      nowDelivered += 1;
      const email = (row.email as string | null)?.trim();
      const brand = row.brand as KlaviyoBrand;

      const ageHours = status.deliveredAt
        ? (Date.now() - new Date(status.deliveredAt).getTime()) / 3_600_000
        : 0;

      if (!email) {
        eventsSkippedNoEmail += 1;
        update.klaviyo_error = "no email on delivery";
      } else if (ageHours > MAX_EVENT_AGE_HOURS) {
        // Backlog: uthamtat innan vi borjade bevaka. Markera som hanterad sa
        // raden inte slas upp igen, men skicka inget.
        eventsSkippedTooOld += 1;
        update.klaviyo_event_sent_at = new Date().toISOString();
        update.klaviyo_error = `skipped: uthamtat ${Math.round(ageHours)}h sedan (backlog)`;
      } else if (!isKlaviyoEventsConfigured(brand)) {
        update.klaviyo_error = `Klaviyo key missing for ${brand}`;
        errors.push({ step: "klaviyo", ref: trackingNumber, error: update.klaviyo_error as string });
      } else if (dryRun) {
        update.klaviyo_error = "dry run - inget skickat";
      } else {
        try {
          await trackKlaviyoEvent({
            brand,
            metricName: PICKUP_METRIC,
            email,
            time: status.deliveredAt ?? undefined,
            uniqueId: `pickup-${trackingNumber}`,
            properties: {
              OrderNumber: row.order_number,
              TrackingNumber: trackingNumber,
              PickupPoint: status.pickupPoint,
              ReadyForPickupAt: status.readyForPickupAt,
              DeliveredAt: status.deliveredAt,
              HasCollagen: row.has_collagen === true,
              Brand: brand,
            },
          });
          update.klaviyo_event_sent_at = new Date().toISOString();
          update.klaviyo_error = null;
          eventsSent += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          update.klaviyo_error = msg;
          errors.push({ step: "klaviyo", ref: trackingNumber, error: msg });
        }
      }
    } else if (status.phase === "returned") {
      nowReturned += 1;
    }

    const { error: updErr } = await db.from("parcel_tracking").update(update).eq("id", row.id);
    if (updErr) errors.push({ step: "update", ref: trackingNumber, error: updErr.message });

    await sleep(BRING_DELAY_MS);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    dry_run: dryRun,
    discovered,
    skipped_no_tracking: skippedNoTracking,
    skipped_no_brand: skippedNoBrand,
    checked,
    now_delivered: nowDelivered,
    now_returned: nowReturned,
    events_sent: eventsSent,
    events_skipped_no_email: eventsSkippedNoEmail,
    events_skipped_backlog: eventsSkippedTooOld,
    errors: errors.slice(0, 25),
    error_count: errors.length,
  });
}

export const GET = trackedCronRoute("pickup-tracker", handleCron);
