import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Legacy client (non-auth, anon key) — used in client components that don't need auth
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role (for API routes — bypasses RLS)
export function createServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Browser client for auth (used in client components)
export function createBrowserSupabase() {
  const { createBrowserClient } = require("@supabase/ssr");
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Allowed emails for login
export function getAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}
