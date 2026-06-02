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

import { resolve4, resolve6 } from 'node:dns/promises';

const DEAD_IPV4 = new Set(['45.84.206.37', '2.57.91.91', '2.57.91.92']); // Hostinger parking/dead shared hosting
const DEAD_IPV6_PREFIX = '2a02:4780'; // Hostinger IPv6 range
const SHOPIFY_IP = '23.227.38.65';

const TIMEOUT_MS = 20000;
const ATTEMPTS = 3;

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
      headers: { 'User-Agent': 'sb-uptime-watch/1.0 (+monitoring)' },
    });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
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
  let lastErr = '';
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const { status } = await fetchOnce(c.url);
      if (status === 200) return null;
      lastErr = `HTTP ${status}`;
    } catch (e) {
      lastErr = e.name === 'AbortError' ? 'timeout' : e.message;
    }
  }
  return `${c.name} (${c.url}): ${lastErr}`;
}

async function checkContent(c) {
  let lastErr = '';
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const { status, body } = await fetchOnce(c.url);
      if (status !== 200) { lastErr = `HTTP ${status}`; continue; }
      if (body.length < c.minBytes) { lastErr = `page too small (${body.length}b - likely broken/empty)`; continue; }
      const missing = c.must.filter((s) => !body.includes(s));
      if (missing.length) { lastErr = `missing on page: ${missing.join(', ')} (loads but broken?)`; continue; }
      return null;
    } catch (e) {
      lastErr = e.name === 'AbortError' ? 'timeout' : e.message;
    }
  }
  return `${c.name} (${c.url}): ${lastErr}`;
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
const results = await Promise.all([
  ...DNS_CHECKS.map(checkDns),
  ...STATUS_CHECKS.map(checkStatus),
  ...CONTENT_CHECKS.map(checkContent),
]);

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
