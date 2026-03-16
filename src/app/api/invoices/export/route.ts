import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import type { InvoiceService } from "@/types";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const now = new Date();
  const period =
    url.searchParams.get("period") ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const db = createServerSupabase();

  // Fetch services
  const { data: services } = await db
    .from("invoice_services")
    .select("*")
    .order("name");

  // Fetch logs for this period
  const { data: logs } = await db
    .from("invoice_logs")
    .select("*")
    .eq("period", period)
    .not("service_id", "is", null)
    .order("created_at");

  const svcMap = new Map(
    (services as InvoiceService[] || []).map((s) => [s.id, s])
  );

  // Build CSV
  const headers = [
    "Service",
    "Status",
    "Amount",
    "Currency",
    "Email From",
    "Email Subject",
    "Email Date",
    "Forwarded At",
    "PDF Filename",
    "Forward Target",
  ];

  const rows = (logs || []).map((log) => {
    const svc = svcMap.get(log.service_id);
    return [
      svc?.name || "Unknown",
      log.status,
      log.amount?.toString() || "",
      log.currency || "",
      log.email_from || "",
      `"${(log.email_subject || "").replace(/"/g, '""')}"`,
      log.email_date ? new Date(log.email_date).toISOString().split("T")[0] : "",
      log.forwarded_at ? new Date(log.forwarded_at).toISOString().split("T")[0] : "",
      log.pdf_filename || "",
      svc?.forward_to === "invoices" ? "Unpaid invoices" : "Paid receipts",
    ].join(",");
  });

  // Add services with no logs as "waiting" rows
  const loggedServiceIds = new Set((logs || []).map((l) => l.service_id));
  for (const svc of (services as InvoiceService[] || [])) {
    if (!loggedServiceIds.has(svc.id)) {
      const [, m] = period.split("-").map(Number);
      const isExpected =
        svc.billing_cycle === "monthly" ||
        (svc.billing_cycle === "annual" && svc.billing_anchor_month === m) ||
        (svc.billing_cycle === "quarterly" &&
          svc.billing_anchor_month &&
          (m - svc.billing_anchor_month + 12) % 3 === 0);

      rows.push(
        [
          svc.name,
          isExpected ? "waiting" : "not_due",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          svc.forward_to === "invoices" ? "Unpaid invoices" : "Paid receipts",
        ].join(",")
      );
    }
  }

  const csv = [headers.join(","), ...rows].join("\n");

  const [year, month] = period.split("-");
  const filename = `invoices_${year}_${month}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
