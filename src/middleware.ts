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

  // Allow public API endpoints (called from external sources)
  if (
    request.nextUrl.pathname.startsWith("/api/pixel") ||
    request.nextUrl.pathname.startsWith("/api/ab-track") ||
    request.nextUrl.pathname.startsWith("/api/telegram/webhook") ||
    request.nextUrl.pathname.startsWith("/api/cron") ||
    request.nextUrl.pathname.startsWith("/api/morning-brief")
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
