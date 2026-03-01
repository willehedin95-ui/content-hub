import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/pulse-cache";
import {
  isFreshdeskConfigured,
  fetchOpenTickets,
  fetchRecentTickets,
  PRIORITY_LABELS,
  type FreshdeskTicket,
} from "@/lib/freshdesk";

// ---- Types ----

export interface SupportData {
  freshdeskConfigured: boolean;
  openTickets: { total: number; byPriority: Record<string, number> };
  responseTime: { avgHours: number | null; trend: "up" | "down" | "stable" | null };
  weekSummary: { resolved: number; created: number };
}

// ---- Helpers ----

const CACHE_KEY = "pulse:support";
const CACHE_TTL = 60; // minutes

function calcAvgResponseHours(tickets: FreshdeskTicket[]): number | null {
  const withResponse = tickets.filter(
    (t) => t.stats?.first_responded_at && t.created_at
  );
  if (withResponse.length === 0) return null;

  const totalHours = withResponse.reduce((sum, t) => {
    const created = new Date(t.created_at).getTime();
    const responded = new Date(t.stats!.first_responded_at!).getTime();
    return sum + (responded - created) / (1000 * 60 * 60);
  }, 0);

  return Math.round((totalHours / withResponse.length) * 10) / 10;
}

function isWithinDays(dateStr: string, days: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(dateStr) >= cutoff;
}

// ---- Route ----

export async function GET() {
  try {
    if (!isFreshdeskConfigured()) {
      return NextResponse.json({
        freshdeskConfigured: false,
        openTickets: { total: 0, byPriority: {} },
        responseTime: { avgHours: null, trend: null },
        weekSummary: { resolved: 0, created: 0 },
      } satisfies SupportData);
    }

    // Check cache
    const cached = await getCached<SupportData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch data
    const [openTickets, recentTickets] = await Promise.all([
      fetchOpenTickets(),
      fetchRecentTickets(14), // 14 days for trend comparison
    ]);

    // Open tickets by priority
    const byPriority: Record<string, number> = {};
    for (const t of openTickets) {
      const label = PRIORITY_LABELS[t.priority] ?? "Unknown";
      byPriority[label] = (byPriority[label] ?? 0) + 1;
    }

    // Average first response time — last 7 days
    const last7d = recentTickets.filter((t) => isWithinDays(t.created_at, 7));
    const prev7d = recentTickets.filter(
      (t) => !isWithinDays(t.created_at, 7) && isWithinDays(t.created_at, 14)
    );

    const currentAvg = calcAvgResponseHours(last7d);
    const previousAvg = calcAvgResponseHours(prev7d);

    let trend: "up" | "down" | "stable" | null = null;
    if (currentAvg !== null && previousAvg !== null) {
      const diff = currentAvg - previousAvg;
      if (diff > 0.5) trend = "up"; // slower = bad
      else if (diff < -0.5) trend = "down"; // faster = good
      else trend = "stable";
    }

    // Week summary: resolved + created in last 7 days
    const resolved = last7d.filter((t) => t.status === 4 || t.status === 5).length;
    const created = last7d.filter((t) => isWithinDays(t.created_at, 7)).length;

    const result: SupportData = {
      freshdeskConfigured: true,
      openTickets: { total: openTickets.length, byPriority },
      responseTime: { avgHours: currentAvg, trend },
      weekSummary: { resolved, created },
    };

    await setCache(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch support data" },
      { status: 500 }
    );
  }
}
