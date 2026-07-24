// Public standalone page for a self-hosted form - direct link to view/test a
// form without embedding it anywhere: /f/hydro13/kontakt?market=se
// Add ?test=1 for testläge: submission saved with is_test=true, no helpdesk
// ticket created. noindex - these URLs are for internal preview/sharing, the
// customer-facing home is the Shopify page embed.

import { NextRequest, NextResponse } from "next/server";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string; slug: string }> }
) {
  const { workspace, slug } = await params;
  const market = (req.nextUrl.searchParams.get("market") || "se").toLowerCase();
  const isTest = req.nextUrl.searchParams.get("test") === "1";

  // Values land in HTML attributes - escape + hard-limit to slug-ish charset
  const safe = (s: string) => escapeHtml(s.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60));
  const ws = safe(workspace);
  const formSlug = safe(slug);
  const mkt = safe(market);

  const testBanner = isTest
    ? `<div style="max-width:680px;margin:0 auto 16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 14px;font-size:14px;color:#92400e;"><strong>TESTLÄGE</strong> - det du skickar in sparas i hubben märkt som test men skapar INGEN helpdesk-ticket.</div>`
    : "";

  const html = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Formulär</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f6f4; margin: 0; padding: 32px 16px 64px; }
    .chp-card { max-width: 680px; margin: 0 auto; background: #fff; border-radius: 14px; padding: 28px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
    @media (max-width: 480px) { .chp-card { padding: 18px; } }
  </style>
</head>
<body>
  ${testBanner}
  <div class="chp-card">
    <div id="ch-form"></div>
    <script src="/forms-embed/v1.js" data-workspace="${ws}" data-form="${formSlug}" data-market="${mkt}" data-target="#ch-form"${isTest ? ' data-test="1"' : ""} defer></script>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
