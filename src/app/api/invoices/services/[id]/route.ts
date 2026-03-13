import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = createServerSupabase();

  const { data, error } = await db
    .from("invoice_services")
    .update({
      name: body.name,
      sender_patterns: body.sender_patterns,
      subject_patterns: body.subject_patterns,
      billing_cycle: body.billing_cycle,
      billing_anchor_month: body.billing_anchor_month ?? null,
      notes: body.notes ?? null,
      is_active: body.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return safeError(error, "Failed to update service");
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { error } = await db
    .from("invoice_services")
    .delete()
    .eq("id", id);

  if (error) return safeError(error, "Failed to delete service");
  return NextResponse.json({ ok: true });
}
