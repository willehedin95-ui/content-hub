import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import nodemailer from "nodemailer";
import type { InvoiceService } from "@/types";

const JUNI_RECEIPTS_EMAIL = "q1k5n1k0@receipts.juni.co";
const JUNI_INVOICES_EMAIL = "q1k5n1k0@invoices.juni.co";

interface ConfirmItem {
  filename: string;
  serviceId: string;
  period: string;
  amount: number | null;
  currency: string | null;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const itemsJson = formData.get("items") as string;
  if (!itemsJson) {
    return NextResponse.json({ error: "Missing items" }, { status: 400 });
  }

  const items: ConfirmItem[] = JSON.parse(itemsJson);
  const saveOnly = formData.get("save_only") === "true";

  // Collect files by filename
  const fileMap = new Map<string, File>();
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file_") && value instanceof File) {
      fileMap.set(value.name, value);
    }
  }

  const db = createServerSupabase();

  // Load services for forward_to info
  const serviceIds = [...new Set(items.map((i) => i.serviceId))];
  const { data: services } = await db
    .from("invoice_services")
    .select("*")
    .in("id", serviceIds);

  const serviceMap = new Map<string, InvoiceService>();
  for (const s of (services ?? []) as InvoiceService[]) {
    serviceMap.set(s.id, s);
  }

  // SMTP setup
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

  const results: { filename: string; success: boolean; error?: string; logId?: string }[] = [];

  for (const item of items) {
    const file = fileMap.get(item.filename);
    if (!file) {
      results.push({ filename: item.filename, success: false, error: "File not found" });
      continue;
    }

    const service = serviceMap.get(item.serviceId);
    if (!service) {
      results.push({ filename: item.filename, success: false, error: "Service not found" });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());

      if (!saveOnly) {
        const forwardEmail =
          service.forward_to === "invoices" ? JUNI_INVOICES_EMAIL : JUNI_RECEIPTS_EMAIL;

        await transporter.sendMail({
          from: user,
          to: forwardEmail,
          subject: `Invoice: ${service.name} — ${item.period}`,
          text: `Bulk uploaded invoice for ${service.name}, period ${item.period}.`,
          attachments: [
            {
              filename: file.name,
              content: buffer,
              contentType: "application/pdf",
            },
          ],
        });
      }

      // Create log entry
      const { data: log } = await db
        .from("invoice_logs")
        .insert({
          service_id: item.serviceId,
          period: item.period,
          status: saveOnly ? "manual" : "forwarded",
          email_subject: `Bulk upload: ${file.name}`,
          email_from: "manual",
          email_date: new Date().toISOString(),
          forwarded_at: saveOnly ? null : new Date().toISOString(),
          pdf_filename: file.name,
          pdf_size_bytes: buffer.length,
          amount: item.amount,
          currency: item.currency,
        })
        .select("id")
        .single();

      results.push({ filename: item.filename, success: true, logId: log?.id });

      // Small delay between emails to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ filename: item.filename, success: false, error: msg });
    }
  }

  const forwarded = results.filter((r) => r.success).length;
  const errors = results.filter((r) => !r.success).length;

  return NextResponse.json({ results, forwarded, errors });
}
