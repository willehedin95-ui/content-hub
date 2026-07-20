#!/usr/bin/env node
// Hourly external uptime watch for our live storefronts + product pages.
// Runs in GitHub Actions (see .github/workflows/uptime-watch.yml), independent
// of Vercel/Hostinger/Shopify so it can alarm even when our own infra is down.
//
// Three layers of checks:
//   1. DNS integrity  - alarm if a domain resolves to a known-dead Hostinger IP
//                       (the exact failure that took swedishbalance.se down 2026-06-01),
//                       or if a Shopify apex stops returning the expected Shopify IP.
//   2. HTTP status    - storefront homepages must respond 200.
//   3. HTTP + content - product pages must be 200, large enough, and contain the
//                       add-to-cart form ("product-form") so "loads but broken" is caught.
//
// On any failure -> Telegram alert + non-zero exit. Completely silent when all
// green (no heartbeat / no "all good" ping - only ever pings on a problem).
//
// False-positive hardening (2026-07-18): the old version fired 3 retries
// back-to-back with no delay and ran all ~11 checks in one Promise.all burst,
// so it (a) rode out nothing transient and (b) tripped Shopify's own per-IP
// rate limiter - producing correlated 429/503 alerts for pages that were fine
// for real users. Fixes: spaced backoff between retries, small-chunk request
// pacing, a real browser User-Agent, and treating 429/430 (monitor-throttled,
// never a real outage) as non-alerting.

import { resolve4, resolve6 } from 'node:dns/promises';

const DEAD_IPV4 = new Set(['45.84.206.37', '2.57.91.91', '2.57.91.92']); // Hostinger parking/dead shared hosting
const DEAD_IPV6_PREFIX = '2a02:4780'; // Hostinger IPv6 range
const SHOPIFY_IP = '23.227.38.65';

const TIMEOUT_MS = 12000;
const ATTEMPTS = 3;
// Delay AFTER a failed attempt, before the next one. A real outage persists
// across these; a transient Shopify blip / rate-limit rejection clears within
// seconds, so spacing the retries is what actually rides it out (back-to-back
// retries rode out nothing). Spans ~14s across the 3 attempts.
const RETRY_BACKOFF_MS = [4000, 10000];
// Statuses that mean "the monitor is being throttled", never "the site is down".
// Shopify returns these to bursty datacenter IPs (429 = rate limited, 430 =
// Shopify's security rejection). Retry, but NEVER alert if that's all we saw.
const THROTTLE_STATUSES = new Set([429, 430]);
// HTTP checks run in small chunks - not all at once - so we never burst
// Shopify's per-IP rate limiter and cause the very 429/503 we're detecting.
const HTTP_CONCURRENCY = 2;
const CHUNK_GAP_MS = 1000;
// A real desktop-browser UA. A "monitoring" UA from a datacenter IP gets
// bot-flagged (429/503) by Shopify far more readily than a browser one.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- check definitions ---------------------------------------------------
const DNS_CHECKS = [
  { name: 'swedishbalance.se', host: 'swedishbalance.se', expect: SHOPIFY_IP },
  { name: 'get-renew.com', host: 'get-renew.com', expect: SHOPIFY_IP },
  { name: 'doginwork.se', host: 'doginwork.se', expect: SHOPIFY_IP },
  // swedishbalance.dk intentionally NOT checked - it now 301-redirects to
  // swedishbalance.se/da-dk via Hostinger forwarding (apex on 2.57.91.91) and
  // is being let go (auto-renew off, exp 2027-01-13).
];

const STATUS_CHECKS = [
  { name: 'SwedishBalance home', url: 'https://swedishbalance.se' },
  { name: 'Renew home', url: 'https://get-renew.com' },
  { name: 'doginwork.se', url: 'https://doginwork.se' },
];

const CONTENT_CHECKS = [
  { name: 'Hydro13 PDP', url: 'https://get-renew.com/products/hydro13', must: ['product-form'], minBytes: 100000 },
  { name: 'HappySleep SE PDP', url: 'https://swedishbalance.se/products/happysleep', must: ['product-form'], minBytes: 100000 },
  { name: 'HappySleep DK PDP', url: 'https://swedishbalance.se/da-dk/products/happysleep', must: ['product-form'], minBytes: 100000 },
  { name: 'HappySleep NO PDP', url: 'https://swedishbalance.se/no-no/products/happysleep', must: ['product-form'], minBytes: 100000 },
  { name: 'doginwork Valpakademin quiz', url: 'https://quiz.doginwork.se/valpakademin/', must: ['Valpakademin'], minBytes: 50000 },
];

// --- helpers -------------------------------------------------------------
async function fetchOnce(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
      },
    });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

// Retry with spaced backoff. `validate(body)` runs on a 200 and returns an
// error string (or null if the page is good). Returns:
//   { ok: true }                            - a 200 that passed validation
//   { ok: false, err, throttledOnly: true } - only ever saw 429/430 (do NOT alert)
//   { ok: false, err, throttledOnly: false }- a real failure (alert)
async function fetchChecked(url, validate) {
  let throttledOnly = true; // stays true only if every failed attempt was 429/430
  let lastHardErr = '';
  let lastThrottleErr = '';
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const { status, body } = await fetchOnce(url);
      if (status === 200) {
        const v = validate ? validate(body) : null;
        if (!v) return { ok: true };
        lastHardErr = v;
        throttledOnly = false;
      } else if (THROTTLE_STATUSES.has(status)) {
        lastThrottleErr = `HTTP ${status}`;
      } else {
        lastHardErr = `HTTP ${status}`;
        throttledOnly = false;
      }
    } catch (e) {
      lastHardErr = e.name === 'AbortError' ? `timeout (>${TIMEOUT_MS / 1000}s)` : e.message;
      throttledOnly = false;
    }
    if (i < ATTEMPTS - 1) await sleep(RETRY_BACKOFF_MS[i] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
  }
  return { ok: false, err: throttledOnly ? lastThrottleErr : lastHardErr, throttledOnly };
}

async function checkDns(c) {
  const a = await resolve4(c.host).catch(() => []);
  const a6 = await resolve6(c.host).catch(() => []);
  const problems = [];
  for (const ip of a) if (DEAD_IPV4.has(ip)) problems.push(`points at DEAD Hostinger IP ${ip}`);
  for (const ip of a6) if (ip.toLowerCase().startsWith(DEAD_IPV6_PREFIX)) problems.push(`points at DEAD Hostinger IPv6 ${ip}`);
  if (c.expect && a.length && !a.includes(c.expect)) problems.push(`apex no longer returns ${c.expect} (got ${a.join(', ') || 'none'})`);
  if (!a.length && !a6.length) problems.push('no A/AAAA records resolve');
  return problems.length ? `DNS ${c.name}: ${problems.join('; ')}` : null;
}

async function checkStatus(c) {
  const r = await fetchChecked(c.url, null);
  if (r.ok) return null;
  if (r.throttledOnly) {
    console.warn(`[throttled - not alerting] ${c.name}: ${r.err}`);
    return null;
  }
  return `${c.name} (${c.url}): ${r.err}`;
}

async function checkContent(c) {
  const validate = (body) => {
    if (body.length < c.minBytes) return `page too small (${body.length}b - likely broken/empty)`;
    const missing = c.must.filter((s) => !body.includes(s));
    if (missing.length) return `missing on page: ${missing.join(', ')} (loads but broken?)`;
    return null;
  };
  const r = await fetchChecked(c.url, validate);
  if (r.ok) return null;
  if (r.throttledOnly) {
    console.warn(`[throttled - not alerting] ${c.name}: ${r.err}`);
    return null;
  }
  return `${c.name} (${c.url}): ${r.err}`;
}

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (!token || !chat) {
    console.error('Missing TELEGRAM_BOT_TOKEN / TELEGRAM_NOTIFY_CHAT_ID - cannot send alert');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('Telegram send failed', res.status, await res.text().catch(() => ''));
}

// --- main ----------------------------------------------------------------
// DNS checks hit resolvers, not the storefronts - safe to run in parallel.
const dnsResults = await Promise.all(DNS_CHECKS.map(checkDns));

// HTTP checks hit mostly the same Shopify store. Run them in small chunks with
// a gap so we never present as a burst (which is what tripped the rate limiter).
const httpTasks = [
  ...STATUS_CHECKS.map((c) => () => checkStatus(c)),
  ...CONTENT_CHECKS.map((c) => () => checkContent(c)),
];
const httpResults = [];
for (let i = 0; i < httpTasks.length; i += HTTP_CONCURRENCY) {
  const chunk = httpTasks.slice(i, i + HTTP_CONCURRENCY).map((fn) => fn());
  httpResults.push(...(await Promise.all(chunk)));
  if (i + HTTP_CONCURRENCY < httpTasks.length) await sleep(CHUNK_GAP_MS);
}

const results = [...dnsResults, ...httpResults];
const failures = results.filter(Boolean);
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

if (failures.length) {
  const msg =
    `🚨 <b>Uptime-vakt: ${failures.length} problem</b>\n\n` +
    failures.map((f) => `• ${f}`).join('\n') +
    `\n\n<i>${stamp}</i>`;
  await telegram(msg);
  console.error(`FAIL (${failures.length}):\n` + failures.join('\n'));
  process.exit(1);
}

// Silent on success - no Telegram notification unless something is wrong.
console.log(`OK - all ${results.length} checks passed (${stamp})`);
