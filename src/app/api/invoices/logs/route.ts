import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { service_id, period, status } = body;

  if (!service_id || !period || !status) {
    return NextResponse.json({ error: "service_id, period, status required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data, error } = await db
    .from("invoice_logs")
    .insert({
      service_id,
      period,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to create log");
  return NextResponse.json(data);
}
