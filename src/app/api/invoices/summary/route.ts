import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import type { InvoiceService, InvoiceSummaryRow, InvoiceStatus } from "@/types";

function isExpectedThisMonth(svc: InvoiceService, period: string): boolean {
  if (svc.billing_cycle === "usage_based") return true; // always "expected" — no false waiting
  if (svc.billing_cycle === "one_time") return false; // never "waiting" — shows up only when invoice arrives
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

  // Fetch logs for this period (only service-linked ones)
  const { data: logs, error: logErr } = await db
    .from("invoice_logs")
    .select("*")
    .eq("period", period)
    .not("service_id", "is", null);

  if (logErr) return safeError(logErr, "Failed to load logs");

  const logsByService = new Map<string, typeof logs>();
  for (const log of logs ?? []) {
    if (!log.service_id) continue;
    const existing = logsByService.get(log.service_id) || [];
    existing.push(log);
    logsByService.set(log.service_id, existing);
  }

  const summary: InvoiceSummaryRow[] = (services ?? []).map((svc: InvoiceService) => {
    const svcLogs = logsByService.get(svc.id) || [];
    const expected = isExpectedThisMonth(svc, period);

    // Calculate totals across all logs
    let totalAmount: number | null = null;
    let totalCurrency: string | null = null;
    for (const l of svcLogs) {
      if (l.amount != null) {
        totalAmount = (totalAmount ?? 0) + l.amount;
        if (!totalCurrency) totalCurrency = l.currency;
      }
    }

    if (!expected && svcLogs.length === 0) {
      return {
        service: svc,
        status: "not_due" as InvoiceStatus,
        log: null,
        logs: svcLogs,
        invoiceCount: 0,
        totalAmount,
        totalCurrency,
        expected,
      };
    }

    if (svcLogs.length === 0) {
      // Usage-based services: no logs means no charges this month.
      // The system monitors the inbox, so if nothing came in, there's nothing to pay.
      const status: InvoiceStatus =
        svc.billing_cycle === "usage_based" ? "not_due" : "waiting";
      return {
        service: svc,
        status,
        log: null,
        logs: [],
        invoiceCount: 0,
        totalAmount: null,
        totalCurrency: null,
        expected,
      };
    }

    // Pick the "best" log (done > sent > pending > error > waiting)
    const priority: Record<string, number> = {
      done: 7,
      sent: 6,
      pending: 4,
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
      logs: svcLogs,
      invoiceCount: svcLogs.length,
      totalAmount,
      totalCurrency,
      expected,
    };
  });

  return NextResponse.json(summary);
}
