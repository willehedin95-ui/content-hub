import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import type { InvoiceService, InvoiceSummaryRow, InvoiceStatus } from "@/types";

function isExpectedThisMonth(svc: InvoiceService, period: string): boolean {
  const month = parseInt(period.split("-")[1], 10); // 1-12
  if (svc.billing_cycle === "monthly") return true;
  if (svc.billing_cycle === "annual") {
    return svc.billing_anchor_month === month;
  }
  if (svc.billing_cycle === "quarterly" && svc.billing_anchor_month) {
    // Expected every 3 months from anchor
    return (month - svc.billing_anchor_month + 12) % 3 === 0;
  }
  return true;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const now = new Date();
  const period =
    url.searchParams.get("period") ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const db = createServerSupabase();

  // Fetch all services
  const { data: services, error: svcErr } = await db
    .from("invoice_services")
    .select("*")
    .order("name");

  if (svcErr) return safeError(svcErr, "Failed to load services");

  // Fetch logs for this period
  const { data: logs, error: logErr } = await db
    .from("invoice_logs")
    .select("*")
    .eq("period", period);

  if (logErr) return safeError(logErr, "Failed to load logs");

  const logsByService = new Map<string, typeof logs>();
  for (const log of logs ?? []) {
    const existing = logsByService.get(log.service_id) || [];
    existing.push(log);
    logsByService.set(log.service_id, existing);
  }

  const summary: InvoiceSummaryRow[] = (services ?? []).map((svc: InvoiceService) => {
    const svcLogs = logsByService.get(svc.id) || [];
    const expected = isExpectedThisMonth(svc, period);

    if (!expected) {
      return { service: svc, status: "not_due" as InvoiceStatus, log: null, expected };
    }

    if (svcLogs.length === 0) {
      return { service: svc, status: "waiting" as InvoiceStatus, log: null, expected };
    }

    // Pick the "best" log (forwarded > manual > received_no_pdf > error > waiting)
    const priority: Record<string, number> = {
      forwarded: 5,
      manual: 4,
      received_no_pdf: 3,
      error: 2,
      waiting: 1,
    };
    const sorted = [...svcLogs].sort(
      (a, b) => (priority[b.status] || 0) - (priority[a.status] || 0)
    );
    const best = sorted[0];

    return {
      service: svc,
      status: best.status as InvoiceStatus,
      log: best,
      expected,
    };
  });

  return NextResponse.json(summary);
}
