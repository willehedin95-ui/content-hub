import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { createBulkForwarder } from "@/lib/invoice-mail";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const period = body.period;
  if (!period) {
    return NextResponse.json({ error: "period is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Get all unsent logs for this period with their service info
  const { data: logs, error } = await db
    .from("invoice_logs")
    .select("id, status, pdf_storage_path, pdf_filename, forwarded_at, period, invoice_services(name, forward_to)")
    .eq("status", "pending")
    .eq("period", period)
    .not("service_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter: only include entries that have a PDF and haven't been forwarded yet
  const forwardable = (logs || []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.pdf_storage_path && !l.forwarded_at
  );

  if (forwardable.length === 0) {
    return NextResponse.json({ forwarded: 0, errors: 0, total: 0 });
  }

  // Use a single SMTP connection for all forwards
  const forwarder = await createBulkForwarder();

  let forwarded = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const log of forwardable) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const service = (log as any).invoice_services;
      if (!service) {
        errors++;
        errorDetails.push(`No service for log ${log.id}`);
        continue;
      }

      // Download PDF from storage
      const { data: pdfData, error: dlErr } = await db.storage
        .from("invoice-pdfs")
        .download(log.pdf_storage_path!);

      if (dlErr || !pdfData) {
        errors++;
        errorDetails.push(`${service.name}: PDF download failed`);
        continue;
      }

      const buffer = Buffer.from(await pdfData.arrayBuffer());

      await forwarder.send({
        serviceName: service.name,
        period: log.period,
        forwardTo: service.forward_to || "receipts",
        pdfFilename: log.pdf_filename || "invoice.pdf",
        pdfBuffer: buffer,
      });

      // Mark as sent
      await db.from("invoice_logs").update({
        status: "sent",
        forwarded_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", log.id);

      forwarded++;
    } catch (e) {
      errors++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svcName = (log as any).invoice_services?.name || "Unknown";
      errorDetails.push(`${svcName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  forwarder.close();

  return NextResponse.json({ forwarded, errors, total: forwardable.length, errorDetails });
}
