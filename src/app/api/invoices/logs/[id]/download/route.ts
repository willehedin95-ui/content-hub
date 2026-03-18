import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

// TODO: Add workspace_id check once column is added to invoice_logs table
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Get the log entry
  const { data: log, error } = await db
    .from("invoice_logs")
    .select("pdf_storage_path, pdf_filename, email_uid, imap_account_id")
    .eq("id", id)
    .single();

  if (error || !log) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  const filename = log.pdf_filename || "invoice.pdf";

  // Try serving from storage first
  if (log.pdf_storage_path) {
    const { data: fileData, error: downloadErr } = await db.storage
      .from("invoice-pdfs")
      .download(log.pdf_storage_path);

    if (!downloadErr && fileData) {
      const arrayBuf = await fileData.arrayBuffer();
      return new NextResponse(arrayBuf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(arrayBuf.byteLength),
        },
      });
    }
  }

  // Fallback: download from IMAP on-demand
  if (!log.email_uid) {
    return NextResponse.json({ error: "No PDF available" }, { status: 404 });
  }

  try {
    const { downloadAndExtractPdf } = await import("@/lib/invoice-mail");
    const result = await downloadAndExtractPdf(
      parseInt(log.email_uid),
      log.imap_account_id || "hostinger"
    );

    if (!result) {
      return NextResponse.json({ error: "Could not extract PDF from email" }, { status: 404 });
    }

    // Cache in storage for future downloads
    const safeName = (result.filename || "invoice.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `fallback/${id}_${safeName}`;
    const { error: uploadErr } = await db.storage
      .from("invoice-pdfs")
      .upload(storagePath, result.buffer, { contentType: "application/pdf", upsert: true });
    if (!uploadErr) {
      await db.from("invoice_logs").update({ pdf_storage_path: storagePath }).eq("id", id);
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename || filename}"`,
        "Content-Length": String(result.buffer.length),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
