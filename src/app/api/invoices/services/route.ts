import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET() {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("invoice_services")
    .select("*")
    .order("name");

  if (error) return safeError(error, "Failed to load services");
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = createServerSupabase();

  const { data, error } = await db
    .from("invoice_services")
    .insert({
      name: body.name,
      sender_patterns: body.sender_patterns || [],
      subject_patterns: body.subject_patterns || [],
      billing_cycle: body.billing_cycle || "monthly",
      billing_anchor_month: body.billing_anchor_month || null,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to create service");
  return NextResponse.json(data);
}
