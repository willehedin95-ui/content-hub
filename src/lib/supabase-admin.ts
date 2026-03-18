import { createClient } from "@supabase/supabase-js";

// Server-side client with service role (for API routes — bypasses RLS)
export function createServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Allowed emails for login
export function getAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}
