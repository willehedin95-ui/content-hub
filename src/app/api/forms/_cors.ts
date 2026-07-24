// CORS for the public form endpoints - the embed runs on the brands' Shopify
// storefronts (different origin from the hub). Separate allowlist from the
// quiz runtime (_cors.ts under /api/quiz) since forms live on shop domains,
// not CF Pages blog domains.

import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  // Envana (fas 1)
  "https://shopenvana.com",
  "https://www.shopenvana.com",
  "https://envana.se",
  "https://www.envana.se",
  // Renew (domän under utfasning men behåll under migreringen)
  "https://get-renew.com",
  "https://www.get-renew.com",
  // SwedishBalance (fas 3)
  "https://swedishbalance.se",
  "https://www.swedishbalance.se",
  "https://swedishbalance.dk",
  "https://www.swedishbalance.dk",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const u = new URL(origin);
    // Shopify preview/editor domains + local dev
    if (u.hostname.endsWith(".myshopify.com")) return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

export function getFormsCORSHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleFormsOptions(origin: string | null): NextResponse {
  return new NextResponse(null, { status: 204, headers: getFormsCORSHeaders(origin) });
}
