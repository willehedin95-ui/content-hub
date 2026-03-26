import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceSettings } from "@/lib/workspace";
import {
  queryUniqueUsers,
  queryDailyUsers,
  queryEventCount,
  queryEventTimeseries,
  queryGroupBy,
  queryEventBreakdown,
} from "@/lib/telemetrydeck";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Section = "overview" | "engagement" | "onboarding" | "challenges" | "features";

export async function GET(req: NextRequest) {
  const settings = await getWorkspaceSettings();
  const appId = settings?.telemetrydeck_app_id as string | undefined;

  if (!appId) {
    return NextResponse.json(
      { error: "TelemetryDeck not configured for this workspace" },
      { status: 400 },
    );
  }

  const section = (req.nextUrl.searchParams.get("section") || "overview") as Section;
  const period = parseInt(req.nextUrl.searchParams.get("period") || "30", 10);

  try {
    switch (section) {
      case "overview":
        return NextResponse.json(await fetchOverview(appId, period));
      case "engagement":
        return NextResponse.json(await fetchEngagement(appId, period));
      case "onboarding":
        return NextResponse.json(await fetchOnboarding(appId));
      case "challenges":
        return NextResponse.json(await fetchChallenges(appId));
      case "features":
        return NextResponse.json(await fetchFeatures(appId, period));
      default:
        return NextResponse.json({ error: "Unknown section" }, { status: 400 });
    }
  } catch (err) {
    console.error("[app-analytics]", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// --- Section fetchers ---

async function fetchOverview(appId: string, period: number) {
  const [
    totalUsers,
    prevPeriodUsers,
    dailyActivity,
    dosesCurrent,
    dosesPrev,
    onboardingStarted,
    onboardingCompleted,
    prevOnboardingStarted,
    prevOnboardingCompleted,
    installs,
    prevInstalls,
  ] = await Promise.all([
    queryUniqueUsers(appId, period),
    queryUniqueUsers(appId, period * 2).then((total) =>
      // Previous period = total(2x) - current period
      queryUniqueUsers(appId, period).then((current) => total - current),
    ),
    queryDailyUsers(appId, period),
    queryEventCount(appId, "dose.taken", period),
    queryEventCount(appId, "dose.taken", period * 2),
    queryEventCount(appId, "onboarding.started"),
    queryEventCount(appId, "onboarding.completed"),
    queryEventCount(appId, "onboarding.started", period),
    queryEventCount(appId, "onboarding.completed", period),
    queryEventCount(appId, "TelemetryDeck.Acquisition.newInstallDetected", period),
    queryEventCount(appId, "TelemetryDeck.Acquisition.newInstallDetected", period * 2),
  ]);

  const dauValues = dailyActivity.map((d) => d.users);
  const avgDau = dauValues.length > 0
    ? Math.round((dauValues.reduce((a, b) => a + b, 0) / dauValues.length) * 10) / 10
    : 0;

  // Previous period DAU for comparison (very rough: prev installs as proxy)
  const onboardingRate =
    onboardingStarted.count > 0
      ? Math.round((onboardingCompleted.count / onboardingStarted.count) * 1000) / 10
      : 0;

  const prevOnboardingRate =
    prevOnboardingStarted.count > 0
      ? Math.round((prevOnboardingCompleted.count / prevOnboardingStarted.count) * 1000) / 10
      : null;

  const dosesChange = dosesPrev.count - dosesCurrent.count > 0
    ? Math.round(((dosesCurrent.count - (dosesPrev.count - dosesCurrent.count)) / (dosesPrev.count - dosesCurrent.count)) * 1000) / 10
    : null;

  const installsChange = prevInstalls.count - installs.count > 0
    ? Math.round(((installs.count - (prevInstalls.count - installs.count)) / (prevInstalls.count - installs.count)) * 1000) / 10
    : null;

  return {
    totalUsers,
    avgDau,
    doses: dosesCurrent.count,
    onboardingRate,
    onboardingRateChange: prevOnboardingRate !== null ? Math.round((onboardingRate - prevOnboardingRate) * 10) / 10 : null,
    installs: installs.count,
    installsChange,
    dosesChange,
    dailyActivity: dailyActivity.map((d) => ({ date: d.date, value: d.users })),
    dailyEvents: dailyActivity.map((d) => ({ date: d.date, value: d.events })),
  };
}

async function fetchEngagement(appId: string, period: number) {
  const [doseTrend, streakDist, doseCount, undoCount, challengeTierDist] = await Promise.all([
    queryEventTimeseries(appId, "dose.taken", period),
    queryGroupBy(appId, "dose.taken", "streak"),
    queryEventCount(appId, "dose.taken", period),
    queryEventCount(appId, "dose.undone", period),
    queryGroupBy(appId, "dose.taken", "challengeTier"),
  ]);

  const undoRate =
    doseCount.count > 0
      ? Math.round((undoCount.count / doseCount.count) * 1000) / 10
      : 0;

  return {
    doseTrend: doseTrend.map((d) => ({ date: d.date, doses: d.count, users: d.users })),
    streakDistribution: streakDist
      .map((s) => ({ streak: parseInt(s.value) || 0, count: s.count }))
      .sort((a, b) => a.streak - b.streak),
    undoRate,
    totalDoses: doseCount.count,
    totalUndos: undoCount.count,
    challengeTierDistribution: challengeTierDist.map((t) => ({
      tier: t.value,
      count: t.count,
      users: t.users,
    })),
  };
}

async function fetchOnboarding(appId: string) {
  const [started, completed, purchaseTypes, bottleCounts] = await Promise.all([
    queryEventCount(appId, "onboarding.started"),
    queryEventCount(appId, "onboarding.completed"),
    queryGroupBy(appId, "onboarding.completed", "purchaseType"),
    queryGroupBy(appId, "onboarding.completed", "bottleCount"),
  ]);

  return {
    funnel: {
      started: started.count,
      completed: completed.count,
      rate: started.count > 0 ? Math.round((completed.count / started.count) * 1000) / 10 : 0,
    },
    purchaseTypes: purchaseTypes.map((p) => ({ type: p.value, count: p.count })),
    bottleCounts: bottleCounts
      .map((b) => ({ bottles: parseInt(b.value) || 0, count: b.count }))
      .sort((a, b) => a.bottles - b.bottles),
  };
}

async function fetchChallenges(appId: string) {
  const [completions, accepts, dismisses] = await Promise.all([
    queryGroupBy(appId, "challenge.completed", "tier"),
    queryGroupBy(appId, "challenge.nextAccepted", "newTier"),
    queryGroupBy(appId, "challenge.nextDismissed", "offeredTier"),
  ]);

  // Merge accept/dismiss by tier
  const tierMap = new Map<string, { accepted: number; dismissed: number }>();
  for (const a of accepts) {
    const existing = tierMap.get(a.value) || { accepted: 0, dismissed: 0 };
    existing.accepted = a.count;
    tierMap.set(a.value, existing);
  }
  for (const d of dismisses) {
    const existing = tierMap.get(d.value) || { accepted: 0, dismissed: 0 };
    existing.dismissed = d.count;
    tierMap.set(d.value, existing);
  }

  return {
    completions: completions.map((c) => ({ tier: c.value, count: c.count, users: c.users })),
    progression: Array.from(tierMap.entries()).map(([tier, data]) => ({
      tier,
      accepted: data.accepted,
      dismissed: data.dismissed,
      acceptRate:
        data.accepted + data.dismissed > 0
          ? Math.round((data.accepted / (data.accepted + data.dismissed)) * 1000) / 10
          : 0,
    })),
  };
}

async function fetchFeatures(appId: string, period: number) {
  const [milestones, selfies, rewards, notifications, eventBreakdown] = await Promise.all([
    queryGroupBy(appId, "journey.milestoneViewed", "type"),
    queryEventCount(appId, "selfie.taken"),
    queryGroupBy(appId, "reward.codeCopied", "code"),
    queryGroupBy(appId, "notification.permissionResult", "granted"),
    queryEventBreakdown(appId, period),
  ]);

  const notifGranted = notifications.find((n) => n.value === "true")?.count ?? 0;
  const notifDenied = notifications.find((n) => n.value === "false")?.count ?? 0;
  const notifTotal = notifGranted + notifDenied;

  return {
    milestoneViews: milestones.map((m) => ({ type: m.value, count: m.count, users: m.users })),
    selfiesTaken: selfies.count,
    selfieUsers: selfies.users,
    rewardCodes: rewards.map((r) => ({ code: r.value, copies: r.count })),
    notificationPermission: {
      granted: notifGranted,
      denied: notifDenied,
      rate: notifTotal > 0 ? Math.round((notifGranted / notifTotal) * 1000) / 10 : 0,
    },
    eventBreakdown: eventBreakdown
      .filter((e) => !e.eventType.startsWith("TelemetryDeck."))
      .sort((a, b) => b.count - a.count),
  };
}
