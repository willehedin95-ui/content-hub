// Health checks for the self-hosted forms, aimed at the failure mode the rest
// of the monitoring misses: the forms going SILENT.
//
// What already existed only covers delivery (a submission that reached the DB
// but cannot reach the helpdesk) and a synthetic capture test that writes
// straight to the DB - and that test picks the OLDEST published form, which is
// one of Envana's, so it never touched SwedishBalance at all.
//
// Neither notices the thing that actually costs money: the embed disappearing
// from a Shopify page, CORS breaking, or a form being unpublished. Then no
// submissions arrive, nothing errors, and the first signal is a customer
// complaining that nobody answered.
//
// Two layers:
//  1. Chain check (fast, deterministic) - fetch each storefront page, assert
//     the embed is there with the right workspace/form/market, then call the
//     public config endpoint with that page's Origin. Catches a broken chain
//     within one cron pass.
//  2. Silence watch (slow backstop) - catches what the chain check cannot see,
//     e.g. the embed loading but submit failing in the browser. Thresholds are
//     measured, not guessed: see FORM_SILENCE_HOURS.

import { createServerSupabase } from "@/lib/supabase-admin";

const HUB = "https://content-hub-nine-theta.vercel.app";

/** Storefront pages that must carry a working embed. */
export const WATCHED_FORM_PAGES: Array<{
  url: string;
  workspace: string;
  form: string;
  market: string;
  label: string;
}> = [
  { url: "https://swedishbalance.se/pages/returformular", workspace: "happysleep", form: "retur", market: "se", label: "SE returformulär" },
  { url: "https://swedishbalance.se/pages/kontakt", workspace: "happysleep", form: "kontakt", market: "se", label: "SE kontakt" },
  { url: "https://swedishbalance.se/pages/angra-kop", workspace: "happysleep", form: "angerratt", market: "se", label: "SE ångerrätt" },
  { url: "https://swedishbalance.se/da-dk/pages/returformular", workspace: "happysleep", form: "retur", market: "dk", label: "DK returformulär" },
  { url: "https://swedishbalance.se/da-dk/pages/kontakt", workspace: "happysleep", form: "kontakt", market: "dk", label: "DK kontakt" },
  { url: "https://swedishbalance.se/da-dk/pages/angra-kop", workspace: "happysleep", form: "angerratt", market: "dk", label: "DK ångerrätt" },
];

/**
 * Hours of silence before a form is treated as suspicious. Measured against
 * 3 months of real Freshdesk volume (2026-06-15 -> 09-14), per case type:
 *   retur      2.8/dag, värsta observerade lucka 66h  -> 120h
 *   angerratt  1.0/dag, värsta observerade lucka 84h  -> 144h
 *   kontakt    1.0/dag, värsta observerade lucka 130h -> 216h
 * Set well above the worst real gap so a quiet week never cries wolf - this is
 * a backstop, the chain check is what catches a break quickly.
 */
/** happysleep (SwedishBalance) - the only workspace whose volume is measured. */
export const SILENCE_WATCH_WORKSPACE_ID = "c40221e2-96fb-4774-92db-74ec0227b262";

export const FORM_SILENCE_HOURS: Record<string, number> = {
  retur: 120,
  angerratt: 144,
  kontakt: 216,
};

export interface FormHealthProblem {
  label: string;
  detail: string;
}

// Shopify answers 403 to a request with no User-Agent at all, and a datacenter
// IP with a bare default is exactly the shape edge protection throttles. Send an
// honest identifying UA instead of pretending to be a browser.
const UA = "ContentHubFormsHealth/1.0 (+monitoring; swedishbalance.se)";

async function fetchOnce(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(url, {
    ...init,
    redirect: "follow",
    headers: { "User-Agent": UA, ...(init?.headers as Record<string, string> | undefined) },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

/** Transient failures must not look like an outage. Retries both thrown errors
 *  AND retryable statuses (5xx/429) - the first version only retried throws, so
 *  a single Shopify 503 fired a critical alert. */
async function fetchText(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: string }> {
  let last: { ok: boolean; status: number; body: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    try {
      const res = await fetchOnce(url, init);
      last = res;
      if (res.ok) return res;
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable) return res;
    } catch {
      last = null;
    }
  }
  if (last) return last;
  throw new Error("nätverksfel efter 3 försök");
}

/** One page: embed present with the right attributes, and config reachable
 *  from that origin. Retries once so a transient network blip is not an alert. */
async function checkOnePage(p: (typeof WATCHED_FORM_PAGES)[number]): Promise<string | null> {
  const origin = new URL(p.url).origin;

  let page: { ok: boolean; status: number; body: string };
  try {
    page = await fetchText(p.url);
  } catch (e) {
    return `sidan gick inte att hämta (${e instanceof Error ? e.message : "okänt fel"})`;
  }
  if (!page.ok) return `sidan svarade HTTP ${page.status}`;

  if (!page.body.includes("/forms-embed/v1.js")) {
    return "embed-skriptet saknas på sidan (någon har ändrat temat eller sektionen)";
  }
  // The attributes decide which form loads - a wrong market silently serves
  // the wrong language, which no HTTP status would reveal.
  const wants = [
    `data-workspace="${p.workspace}"`,
    `data-form="${p.form}"`,
    `data-market="${p.market}"`,
  ];
  const missing = wants.filter((w) => !page.body.includes(w));
  if (missing.length) return `fel embed-attribut, saknar ${missing.join(" ")}`;

  // Must match a REAL script tag. A plain substring search gives false alarms:
  // Transcy caches the page's old description in a JS string
  // (ShopifyTC.resource_description), where the markup is escaped (\u003c).
  if (/<script[^>]+src=["']https:\/\/server\.fillout\.com/.test(page.body)) {
    return "Fillout-skriptet har kommit tillbaka på sidan";
  }

  const cfgUrl = `${HUB}/api/forms/config?workspace=${encodeURIComponent(p.workspace)}&slug=${encodeURIComponent(p.form)}&market=${encodeURIComponent(p.market)}`;
  let cfg: { ok: boolean; status: number; body: string };
  try {
    cfg = await fetchText(cfgUrl, { headers: { Origin: origin } });
  } catch (e) {
    return `config-anropet gick inte att göra (${e instanceof Error ? e.message : "okänt fel"})`;
  }
  if (!cfg.ok) return `config svarade HTTP ${cfg.status} - formuläret kan inte laddas`;
  try {
    const parsed = JSON.parse(cfg.body) as { form?: { config?: { fields?: unknown[] } } };
    const fields = parsed.form?.config?.fields;
    if (!Array.isArray(fields) || fields.length === 0) return "config saknar fält";
  } catch {
    return "config gick inte att tolka som JSON";
  }
  return null;
}

/** Layer 1: is the public chain intact for every watched page? */
export async function checkFormChain(): Promise<FormHealthProblem[]> {
  const problems: FormHealthProblem[] = [];
  for (const p of WATCHED_FORM_PAGES) {
    const err = await checkOnePage(p);
    if (err) problems.push({ label: p.label, detail: err });
  }
  return problems;
}

/** Layer 2: has a form that normally sees traffic gone quiet? */
export async function checkFormSilence(): Promise<FormHealthProblem[]> {
  const db = createServerSupabase();
  const problems: FormHealthProblem[] = [];

  // Scoped to the workspace whose volume the thresholds were measured on.
  // Envana's forms share these slugs but have their own (much lower, newer)
  // traffic - judging them by SwedishBalance numbers would only cry wolf.
  const { data: forms } = await db
    .from("forms")
    .select("id, slug, market, name, created_at")
    .eq("status", "published")
    .eq("workspace_id", SILENCE_WATCH_WORKSPACE_ID);
  if (!forms) return problems;

  // Group by slug: thresholds were measured per case type, not per market, and
  // a per-market break is the chain check's job anyway.
  const bySlug = new Map<string, { ids: string[]; oldest: number }>();
  for (const f of forms as Array<{ id: string; slug: string; created_at: string }>) {
    if (!(f.slug in FORM_SILENCE_HOURS)) continue;
    const prev = bySlug.get(f.slug);
    const born = new Date(f.created_at).getTime();
    bySlug.set(f.slug, {
      ids: [...(prev?.ids ?? []), f.id],
      oldest: Math.min(prev?.oldest ?? born, born),
    });
  }

  for (const [slug, { ids, oldest }] of bySlug) {
    const hours = FORM_SILENCE_HOURS[slug];
    // A form that has not been live longer than its own threshold cannot be
    // judged silent yet - there simply has not been time to receive traffic.
    if (Date.now() - oldest < hours * 60 * 60 * 1000) continue;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .in("form_id", ids)
      .eq("is_test", false)
      .gte("created_at", cutoff);
    if ((count ?? 0) === 0) {
      problems.push({
        label: slug,
        detail: `inga inskick på ${hours}h (normalt flera i veckan) - kolla att formuläret går att fylla i`,
      });
    }
  }
  return problems;
}
