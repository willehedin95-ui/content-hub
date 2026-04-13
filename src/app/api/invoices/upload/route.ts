import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import nodemailer from "nodemailer";
import dns from "dns";
import net from "net";

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

  // Pre-resolve DNS to avoid Vercel's getaddrinfo failures
  let resolvedHost = host;
  let servername: string | false = false;
  if (!net.isIP(host)) {
    try {
      const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
      resolver.setServers(["8.8.8.8", "1.1.1.1"]);
      const addresses = await resolver.resolve4(host);
      if (addresses.length > 0) { resolvedHost = addresses[0]; servername = host; }
    } catch { /* try fallback */ }
    if (resolvedHost === host) {
      const fallbacks: Record<string, string> = { "smtp.hostinger.com": "172.65.255.143" };
      if (fallbacks[host]) { resolvedHost = fallbacks[host]; servername = host; }
    }
  }

  const transporter = nodemailer.createTransport({
    host: resolvedHost,
    port,
    secure: true,
    auth: { user, pass },
    ...(servername ? { tls: { servername } } : {}),
  });

  // Try to forward via SMTP, but don't fail the upload if SMTP is down
  let smtpOk = false;
  try {
    await transporter.sendMail({
      from: user,
      to: forwardEmail,
      subject: `Invoice: ${service.name} - ${period}`,
      text: `Manually uploaded invoice for ${service.name}, period ${period}.`,
      attachments: [
        {
          filename: file.name,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });
    smtpOk = true;
  } catch (e) {
    console.error("[invoice-upload] SMTP failed, saving as pending:", e instanceof Error ? e.message : e);
  }

  // Store PDF in Supabase storage for later download/forwarding
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${serviceId}/${period}/manual_${Date.now()}_${safeName}`;
  await db.storage
    .from("invoice-pdfs")
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true })
    .catch((err: Error) => console.error("[invoice-upload] Storage upload failed:", err.message));

  // Try to resolve an existing detection log that has no PDF yet
  // (e.g. auto-detected email without attachment). Only claim logs
  // without a PDF so multi-file uploads don't overwrite each other.
  const { data: pendingLog } = await db
    .from("invoice_logs")
    .select("id")
    .eq("service_id", serviceId)
    .eq("period", period)
    .in("status", ["pending", "error"])
    .is("pdf_storage_path", null)
    .order("email_date", { ascending: true })
    .limit(1)
    .single();

  let logId: string | undefined;

  if (pendingLog) {
    await db.from("invoice_logs").update({
      status: smtpOk ? "sent" : "pending",
      forwarded_at: smtpOk ? new Date().toISOString() : null,
      pdf_filename: file.name,
      pdf_size_bytes: buffer.length,
      pdf_storage_path: storagePath,
    }).eq("id", pendingLog.id);
    logId = pendingLog.id;
  } else {
    const { data: log } = await db.from("invoice_logs").insert({
      service_id: serviceId,
      period,
      status: smtpOk ? "sent" : "pending",
      email_subject: `Manual upload: ${file.name}`,
      email_from: "manual",
      email_date: new Date().toISOString(),
      forwarded_at: smtpOk ? new Date().toISOString() : null,
      pdf_filename: file.name,
      pdf_size_bytes: buffer.length,
      pdf_storage_path: storagePath,
    }).select("id").single();
    logId = log?.id;
  }

  return NextResponse.json({
    success: true,
    logId,
    forwarded: smtpOk,
    ...(smtpOk ? {} : { warning: "PDF saved but SMTP forwarding failed - use Send to Juni later" }),
  });
}
