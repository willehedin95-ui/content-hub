import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import type { InvoiceService } from "@/types";

interface RenewalAlert {
  service: InvoiceService;
  nextDueMonth: string; // "2026-04"
  daysUntil: number;
  lastAmount: number | null;
  lastCurrency: string | null;
}

interface PauseCandidate {
  service: InvoiceService;
  lastInvoiceDate: string | null;
  monthsSinceLastInvoice: number;
}

interface SpendAnomaly {
  service: InvoiceService;
  currentAmount: number;
  averageAmount: number;
  currency: string;
  percentChange: number;
}

interface MonthlySpend {
  period: string;
  total: number;
  currency: string;
  breakdown: { serviceName: string; amount: number }[];
}

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const url = new URL(req.url);
  const period =
    url.searchParams.get("period") ||
    (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();

  const [y, m] = period.split("-").map(Number);

  // Load all services
  const { data: services } = await db
    .from("invoice_services")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (!services || services.length === 0) {
    return NextResponse.json({
      renewalAlerts: [],
      pauseCandidates: [],
      spendAnomalies: [],
      monthlySpend: null,
    });
  }

  // Load all logs (last 12 months for history)
  const twelveMoAgo = new Date(y, m - 13, 1);
  const sinceStr = `${twelveMoAgo.getFullYear()}-${String(twelveMoAgo.getMonth() + 1).padStart(2, "0")}`;

  const { data: allLogs } = await db
    .from("invoice_logs")
    .select("*")
    .not("service_id", "is", null)
    .gte("period", sinceStr)
    .in("status", ["sent", "done"]);

  const logs = allLogs || [];

  // --- Renewal Alerts (upcoming non-monthly invoices in next 30 days) ---
  const renewalAlerts: RenewalAlert[] = [];
  const now = new Date();

  for (const svc of services as InvoiceService[]) {
    if (svc.billing_cycle === "monthly" || svc.billing_cycle === "usage_based") continue;

    const anchor = svc.billing_anchor_month;
    if (!anchor) continue;

    // Find next due date
    let nextDueMonth: Date;
    if (svc.billing_cycle === "annual") {
      nextDueMonth = new Date(y, anchor - 1, 1);
      if (nextDueMonth <= now) {
        nextDueMonth = new Date(y + 1, anchor - 1, 1);
      }
    } else {
      // quarterly
      const quarters = [anchor - 1, anchor + 2, anchor + 5, anchor + 8].map(
        (m) => ((m % 12) + 12) % 12
      );
      nextDueMonth = new Date(y + 1, quarters[0], 1); // fallback
      for (const qm of quarters) {
        const candidate = new Date(y, qm, 1);
        if (candidate > now) {
          nextDueMonth = candidate;
          break;
        }
        const candidate2 = new Date(y + 1, qm, 1);
        if (candidate2 > now && candidate2 < nextDueMonth) {
          nextDueMonth = candidate2;
          break;
        }
      }
    }

    const daysUntil = Math.ceil(
      (nextDueMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntil <= 45) {
      // Find last amount for this service
      const svcLogs = logs
        .filter((l) => l.service_id === svc.id && l.amount)
        .sort((a, b) => b.period.localeCompare(a.period));
      const lastLog = svcLogs[0];

      renewalAlerts.push({
        service: svc,
        nextDueMonth: `${nextDueMonth.getFullYear()}-${String(nextDueMonth.getMonth() + 1).padStart(2, "0")}`,
        daysUntil,
        lastAmount: lastLog?.amount || null,
        lastCurrency: lastLog?.currency || null,
      });
    }
  }

  // --- Auto-pause candidates (no invoice in 3+ months for monthly services) ---
  const pauseCandidates: PauseCandidate[] = [];

  for (const svc of services as InvoiceService[]) {
    if (svc.billing_cycle !== "monthly") continue;

    const svcLogs = logs
      .filter((l) => l.service_id === svc.id)
      .sort((a, b) => b.period.localeCompare(a.period));

    const lastLog = svcLogs[0];
    if (!lastLog) {
      // Never received an invoice — might be new, skip
      continue;
    }

    const lastDate = lastLog.period; // "2026-01"
    const [ly, lm] = lastDate.split("-").map(Number);
    const monthsSince = (y - ly) * 12 + (m - lm);

    if (monthsSince >= 3) {
      pauseCandidates.push({
        service: svc,
        lastInvoiceDate: lastLog.period,
        monthsSinceLastInvoice: monthsSince,
      });
    }
  }

  // --- Spend anomalies (current month vs. 3-month average, >30% deviation) ---
  const spendAnomalies: SpendAnomaly[] = [];

  for (const svc of services as InvoiceService[]) {
    const svcLogs = logs.filter((l) => l.service_id === svc.id && l.amount);

    // Sum all amounts for the current period (handles multiple invoices per month)
    const currentPeriodLogs = svcLogs.filter((l) => l.period === period);
    const currentAmount = currentPeriodLogs.reduce((s, l) => s + (l.amount || 0), 0);
    if (!currentAmount) continue;

    // Get previous months — sum per period for usage-based services
    const prevPeriods = new Map<string, number>();
    for (const l of svcLogs) {
      if (l.period >= period || !l.amount) continue;
      prevPeriods.set(l.period, (prevPeriods.get(l.period) || 0) + l.amount);
    }
    const prevAmounts = [...prevPeriods.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 3)
      .map(([, amt]) => amt);

    if (prevAmounts.length < 2) continue; // Need at least 2 months of history

    const avg = prevAmounts.reduce((s, a) => s + a, 0) / prevAmounts.length;
    const pctChange = ((currentAmount - avg) / avg) * 100;

    if (Math.abs(pctChange) > 30) {
      spendAnomalies.push({
        service: svc,
        currentAmount: currentAmount,
        averageAmount: Math.round(avg * 100) / 100,
        currency: currentPeriodLogs[0]?.currency || "SEK",
        percentChange: Math.round(pctChange),
      });
    }
  }

  // --- Monthly spend summary (sum per service, handles multiple invoices) ---
  const currentLogs = logs.filter((l) => l.period === period && l.amount);
  const spendByService = new Map<string, { name: string; amount: number }>();
  for (const l of currentLogs) {
    const svc = (services as InvoiceService[]).find((s) => s.id === l.service_id);
    const name = svc?.name || "Unknown";
    const existing = spendByService.get(l.service_id!) || { name, amount: 0 };
    existing.amount += l.amount as number;
    spendByService.set(l.service_id!, existing);
  }
  const breakdown = [...spendByService.values()].map((s) => ({
    serviceName: s.name,
    amount: Math.round(s.amount * 100) / 100,
  }));
  const total = breakdown.reduce((s, b) => s + b.amount, 0);

  const monthlySpend: MonthlySpend | null =
    breakdown.length > 0
      ? {
          period,
          total: Math.round(total * 100) / 100,
          currency: currentLogs[0]?.currency || "SEK",
          breakdown: breakdown.sort((a, b) => b.amount - a.amount),
        }
      : null;

  return NextResponse.json({
    renewalAlerts,
    pauseCandidates,
    spendAnomalies,
    monthlySpend,
  });
}
