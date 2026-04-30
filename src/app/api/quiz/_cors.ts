// Shared CORS helpers for quiz runtime endpoints.
// These endpoints are called from CF Pages domains (different origin from the hub).

import { NextResponse } from "next/server";

// Allowed origins for quiz runtime API calls
const ALLOWED_ORIGINS = new Set([
  "https://halsobladet.com",
  "https://smarthelse.dk",
  "https://helseguiden.com",
  "https://quiz.doginwork.se",
  // Allow pages.dev preview URLs for testing
  "https://halsobladet-blog.pages.dev",
  "https://smarthelse.pages.dev",
  "https://helseguiden.pages.dev",
  "https://doginwork-quiz.pages.dev",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow *.pages.dev subdomains for CF preview deployments
  try {
    const u = new URL(origin);
    return u.hostname.endsWith(".pages.dev");
  } catch {
    return false;
  }
}

export function getCORSHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Convenience export: permissive headers (used when we can't read origin, e.g. server errors)
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function handleOptions(origin?: string | null): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCORSHeaders(origin ?? null),
  });
}
