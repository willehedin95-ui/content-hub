import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { approveConceptAction, rejectConceptAction } from "@/lib/approval-actions";
import { triggerAutopilotTranslations } from "@/lib/autopilot-translations";

export const maxDuration = 800;

// POST /api/autopilot/concepts/:id/approve
// body: { approved: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const body = await req.json().catch(() => ({}));
  const approved = body.approved !== false; // default true

  if (approved) {
    const result = await approveConceptAction(jobId, "hub_ui");

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.error === "Concept not found" ? 404 : 400 });
    }

    if (result.action === "already_approved") {
      return NextResponse.json({ ok: true, action: "already_approved" });
    }

    // Trigger translation pipeline in background (after response is sent)
    after(async () => {
      try {
        console.log(`[autopilot-approve] Starting translations for job ${jobId}`);
        const translationResult = await triggerAutopilotTranslations(jobId);
        console.log(`[autopilot-approve] Translations done:`, translationResult);
      } catch (err) {
        console.error(`[autopilot-approve] Translation pipeline failed for ${jobId}:`, err);
        // Notify via Telegram so user knows the pipeline broke
        try {
          const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
          if (chatId) {
            const { sendMessage } = await import("@/lib/telegram");
            const label = result.conceptNumber ? `#${result.conceptNumber} ${result.jobName}` : result.jobName;
            await sendMessage(chatId, [
              `⚠️ Translation pipeline failed`,
              `Concept: ${label}`,
              `Error: ${err instanceof Error ? err.message : String(err)}`,
              ``,
              `Concept is on launchpad but translations won't complete automatically.`,
            ].join("\n"));
          }
        } catch { /* don't let notification failure propagate */ }
      }
    });

    return NextResponse.json({ ok: true, action: "approved", translationsStarted: true });
  } else {
    const result = await rejectConceptAction(jobId, "hub_ui");

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, action: "rejected" });
  }
}
