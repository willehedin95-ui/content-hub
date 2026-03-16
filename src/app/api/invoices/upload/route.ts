import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import nodemailer from "nodemailer";

const JUNI_RECEIPTS_EMAIL = "q1k5n1k0@receipts.juni.co";
const JUNI_INVOICES_EMAIL = "q1k5n1k0@invoices.juni.co";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const serviceId = formData.get("service_id") as string;
  const period = formData.get("period") as string;

  if (!file || !serviceId || !period) {
    return NextResponse.json({ error: "Missing file, service_id, or period" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Get service to determine forward target
  const { data: service, error: svcErr } = await db
    .from("invoice_services")
    .select("*")
    .eq("id", serviceId)
    .single();

  if (svcErr || !service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const forwardEmail =
    service.forward_to === "invoices" ? JUNI_INVOICES_EMAIL : JUNI_RECEIPTS_EMAIL;

  // Read file
  const buffer = Buffer.from(await file.arrayBuffer());

  // Forward to Juni via SMTP
  const host = process.env.INVOICE_SMTP_HOST || "smtp.hostinger.com";
  const port = parseInt(process.env.INVOICE_SMTP_PORT || "465", 10);
  const user = process.env.INVOICE_SMTP_EMAIL || process.env.INVOICE_IMAP_EMAIL;
  const pass = process.env.INVOICE_SMTP_PASSWORD || process.env.INVOICE_IMAP_PASSWORD;

  if (!user || !pass) {
    return NextResponse.json({ error: "SMTP credentials not configured" }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: user,
      to: forwardEmail,
      subject: `Invoice: ${service.name} — ${period}`,
      text: `Manually uploaded invoice for ${service.name}, period ${period}.`,
      attachments: [
        {
          filename: file.name,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });

    // Create log entry
    const { data: log } = await db.from("invoice_logs").insert({
      service_id: serviceId,
      period,
      status: "forwarded",
      email_subject: `Manual upload: ${file.name}`,
      email_from: "manual",
      email_date: new Date().toISOString(),
      forwarded_at: new Date().toISOString(),
      pdf_filename: file.name,
      pdf_size_bytes: buffer.length,
    }).select("id").single();

    return NextResponse.json({ success: true, logId: log?.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
