import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { runPageSpeedCheck, scoreColor, formatMs } from "@/lib/pagespeed";
import { sendMessage, isTelegramDisabled } from "@/lib/telegram";

export const maxDuration = 120;

const DEFAULT_THRESHOLD = 50;
const DEGRADATION_DROP = 15; // alert if score drops ≥15 points from 7d avg
const LCP_POOR_MS = 4000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Get all workspaces with pagespeed enabled
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, settings");

  if (!workspaces?.length) {
    return NextResponse.json({ skipped: true, reason: "No workspaces" });
  }

  const results: Array<{
    workspace: string;
    url: string;
    mobile: number | null;
    desktop: number | null;
    alerts: string[];
  }> = [];

  for (const ws of workspaces) {
    if (isTelegramDisabled(ws)) continue;
    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    if (!settings.pagespeed_enabled) continue;

    const urls = (settings.pagespeed_urls as string[]) ?? [];
    if (!urls.length) continue;

    const threshold = (settings.pagespeed_threshold as number) ?? DEFAULT_THRESHOLD;

    for (const url of urls) {
      const alerts: string[] = [];
      let mobileScore: number | null = null;
      let desktopScore: number | null = null;

      for (const strategy of ["mobile", "desktop"] as const) {
        try {
          const result = await runPageSpeedCheck(url, strategy);

          // Store in DB
          await db.from("pagespeed_results").insert({
            workspace_id: ws.id,
            url,
            strategy,
            performance_score: result.performance_score / 100, // store as 0-1
            lcp_ms: result.lcp_ms,
            fcp_ms: result.fcp_ms,
            cls: result.cls,
            tbt_ms: result.tbt_ms,
            si_ms: result.si_ms,
            ttfb_ms: result.ttfb_ms,
            opportunities: result.opportunities,
          });

          if (strategy === "mobile") mobileScore = result.performance_score;
          else desktopScore = result.performance_score;

          // Check alerts
          if (result.performance_score < threshold) {
            alerts.push(
              `${strategy} score ${result.performance_score} (below ${threshold})`
            );
          }

          if (result.lcp_ms > LCP_POOR_MS) {
            alerts.push(
              `${strategy} LCP ${formatMs(result.lcp_ms)} (poor, >4s)`
            );
          }

          // Check degradation vs 7-day average
          const { data: recent } = await db
            .from("pagespeed_results")
            .select("performance_score")
            .eq("workspace_id", ws.id)
            .eq("url", url)
            .eq("strategy", strategy)
            .gte(
              "checked_at",
              new Date(Date.now() - 7 * 86400000).toISOString()
            )
            .order("checked_at", { ascending: false })
            .limit(7);

          if (recent && recent.length >= 2) {
            // Exclude the one we just inserted (it's the most recent)
            const previous = recent.slice(1);
            const avgScore =
              previous.reduce(
                (sum, r) => sum + (Number(r.performance_score) || 0) * 100,
                0
              ) / previous.length;

            if (avgScore - result.performance_score >= DEGRADATION_DROP) {
              alerts.push(
                `${strategy} dropped ${Math.round(avgScore - result.performance_score)} points from 7d avg (${Math.round(avgScore)} → ${result.performance_score})`
              );
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[pagespeed] Failed to check ${url} (${strategy}):`, msg);
          alerts.push(`${strategy} check failed: ${msg.slice(0, 100)}`);
        }

        // Small delay between checks to respect rate limits
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Send Telegram alert if any issues
      if (alerts.length > 0) {
        const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
        if (chatId) {
          const scoreStr = [
            mobileScore !== null ? `Mobile: ${mobileScore}` : null,
            desktopScore !== null ? `Desktop: ${desktopScore}` : null,
          ]
            .filter(Boolean)
            .join(" | ");

          const mobileEmoji =
            mobileScore !== null
              ? scoreColor(mobileScore) === "green"
                ? "🟢"
                : scoreColor(mobileScore) === "amber"
                  ? "🟡"
                  : "🔴"
              : "❓";

          await sendMessage(
            chatId,
            `⚡ PageSpeed Alert — ${url}\n\n${mobileEmoji} ${scoreStr}\n\n${alerts.map((a) => `• ${a}`).join("\n")}`,
            { parse_mode: "HTML" }
          );
        }
      }

      results.push({
        workspace: ws.slug,
        url,
        mobile: mobileScore,
        desktop: desktopScore,
        alerts,
      });
    }
  }

  return NextResponse.json({ results });
}
