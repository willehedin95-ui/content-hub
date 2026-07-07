import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Allow auth routes without login
  if (request.nextUrl.pathname.startsWith("/auth")) {
    // Still refresh session on auth routes
    await supabase.auth.getSession();
    return supabaseResponse;
  }

  // Allow public API endpoints (called from external sources).
  // Boundary-matched (exact path or path + "/") — a bare startsWith over-matches
  // sibling routes (e.g. "/api/cron" caught /api/cron-status, "/api/pixel"
  // caught /api/pixel/stats which leaks revenue aggregates).
  const publicExact = [
    // Tracking POST only — /api/pixel/stats must stay session-gated
    "/api/pixel",
  ];
  const publicPrefixes = [
    "/api/telegram/webhook",
    // Cron routes verify CRON_SECRET themselves; /api/cron-status is NOT public
    "/api/cron",
    // Route accepts CRON_SECRET bearer or Supabase session inline
    "/api/morning-brief",
    // Token-gated inline (x-import-token) — called from Chrome extension
    "/api/research/sources/bulk-import",
    "/api/fillout-to-freshdesk",
    // Gömd publik brand-checker (mobil) - token-skyddad i sidan + API:t
    "/bcheck",
    "/api/bcheck",
    "/api/bcheck-ideas",
    "/api/bcheck-shortlist",
    // Quiz runtime bundle (content-hashed JS served to published + preview quizzes)
    "/_runtime",
    // Preview iframe loads the runtime bundle from /quiz-bundle/[filename]
    "/quiz-bundle",
    // Quiz runtime API endpoints (hit from published quizzes on external domains)
    "/api/quiz/session",
    "/api/quiz/events",
    "/api/quiz/klaviyo-subscribe",
    // Shopify webhook: HMAC-authenticated, called by Shopify servers
    "/api/quiz/shopify-webhook",
    // Hydro13 iOS app lookups (auth via x-api-key header)
    "/api/loop",
    "/api/shopify/customer",
  ];
  const path = request.nextUrl.pathname;
  if (
    publicExact.includes(path) ||
    publicPrefixes.some((p) => path === p || path.startsWith(p + "/"))
  ) {
    return supabaseResponse;
  }

  // Refresh session from cookie (no network call — reads JWT from cookie, auto-refreshes if expired)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Redirect unauthenticated users to login
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Ensure workspace cookie exists (default to "happysleep")
  if (!request.cookies.get("ch-workspace")?.value) {
    supabaseResponse.cookies.set("ch-workspace", "happysleep", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
