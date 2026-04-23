import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

type DateRange = "today" | "last_7d" | "last_30d" | "last_90d" | "custom";

function resolveRange(
  range: DateRange,
  since?: string | null,
  until?: string | null,
): { since: Date; until: Date } {
  const now = new Date();
  const untilDate = until ? new Date(until) : new Date(now);
  if (range === "custom" && since) {
    return { since: new Date(since), until: untilDate };
  }
  const days =
    range === "today"
      ? 1
      : range === "last_7d"
        ? 7
        : range === "last_30d"
          ? 30
          : 90;
  const sinceDate = new Date(now);
  sinceDate.setDate(sinceDate.getDate() - days);
  return { since: sinceDate, until: untilDate };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Verify quiz belongs to this workspace
  const { data: quiz, error: quizErr } = await db
    .from("quizzes")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (quizErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const url = req.nextUrl;
  const rangeParam = (url.searchParams.get("range") ?? "last_30d") as DateRange;
  const device = url.searchParams.get("device") ?? "all";
  const variantGroupParam = url.searchParams.get("variant_group");
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");

  const { since, until } = resolveRange(rangeParam, sinceParam, untilParam);

  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  // variant_filter JSONB: if variant_group param is passed as "groupId:stepId"
  // format, convert to {groupId: stepId}
  let variantFilter: Record<string, string> | null = null;
  if (variantGroupParam) {
    const parts = variantGroupParam.split(":");
    if (parts.length === 2) {
      variantFilter = { [parts[0]]: parts[1] };
    }
  }

  // Run all 4 RPCs in parallel
  const [summaryRes, funnelRes, optionsRes, variantsRes] = await Promise.all([
    db.rpc("quiz_summary", {
      quiz_id_in: id,
      since: sinceIso,
      until: untilIso,
    }),
    db.rpc("quiz_funnel_stats", {
      quiz_id_in: id,
      since: sinceIso,
      until: untilIso,
      device_filter: device,
      variant_filter: variantFilter,
    }),
    db.rpc("quiz_option_distribution", {
      quiz_id_in: id,
      since: sinceIso,
      until: untilIso,
    }),
    db.rpc("quiz_variant_comparison", {
      quiz_id_in: id,
      since: sinceIso,
      until: untilIso,
    }),
  ]);

  if (summaryRes.error) return safeError(summaryRes.error, "Failed to load summary");
  if (funnelRes.error) return safeError(funnelRes.error, "Failed to load funnel");
  if (optionsRes.error) return safeError(optionsRes.error, "Failed to load options");
  if (variantsRes.error) return safeError(variantsRes.error, "Failed to load variants");

  // quiz_summary returns a single row in an array
  const summaryRow = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;

  const response = NextResponse.json({
    summary: summaryRow ?? {
      starts: 0,
      completions: 0,
      completion_rate: 0,
      email_captures: 0,
      median_time_to_exit_sec: 0,
    },
    funnel: funnelRes.data ?? [],
    options: optionsRes.data ?? [],
    variants: variantsRes.data ?? [],
    range: { since: sinceIso, until: untilIso },
  });

  response.headers.set("Cache-Control", "private, max-age=60");
  return response;
}
