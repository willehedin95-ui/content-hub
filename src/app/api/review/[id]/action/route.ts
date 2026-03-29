import { NextRequest, NextResponse, after } from "next/server";
import {
  approveConceptAction,
  rejectConceptAction,
  approveVideoAction,
  rejectVideoAction,
  approveIterationAction,
  rejectIterationAction,
  approveTranslationsAction,
} from "@/lib/approval-actions";

export const maxDuration = 300;

// POST /api/review/:id/action
// body: { action: "approve" | "reject", type: "concept" | "iteration" | "video" | "translation_review" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, type } = body as { action?: string; type?: string };

  if (!action || !type) {
    return NextResponse.json({ error: "Missing action or type" }, { status: 400 });
  }

  let result;

  if (type === "concept" && action === "approve") {
    result = await approveConceptAction(id, "review_page");
    if (result.ok && result.action === "approved") {
      after(async () => {
        try {
          const { triggerAutopilotTranslations } = await import("@/lib/autopilot-translations");
          console.log(`[review-approve] Starting translations for job ${id}`);
          const res = await triggerAutopilotTranslations(id);
          console.log(`[review-approve] Translations done:`, res);
        } catch (err) {
          console.error(`[review-approve] Translation pipeline failed for ${id}:`, err);
        }
      });
    }
  } else if (type === "concept" && action === "reject") {
    result = await rejectConceptAction(id, "review_page");
  } else if (type === "video" && action === "approve") {
    result = await approveVideoAction(id, "review_page");
  } else if (type === "video" && action === "reject") {
    result = await rejectVideoAction(id, "review_page");
  } else if (type === "iteration" && action === "approve") {
    result = await approveIterationAction(id, "review_page");
    if (result.ok) {
      after(async () => {
        try {
          const { triggerAutopilotTranslations } = await import("@/lib/autopilot-translations");
          console.log(`[review-iterate-approve] Starting translations for job ${id}`);
          const res = await triggerAutopilotTranslations(id);
          console.log(`[review-iterate-approve] Translations done:`, res);
        } catch (err) {
          console.error(`[review-iterate-approve] Translation pipeline failed for ${id}:`, err);
        }
      });
    }
  } else if (type === "iteration" && action === "reject") {
    result = await rejectIterationAction(id, "review_page");
  } else if (type === "translation_review" && action === "approve") {
    result = await approveTranslationsAction(id);
  } else if (type === "translation_review" && action === "reject") {
    // Translation reviews don't have a "reject" — hold for editing
    result = { ok: true, action: "held", jobId: id };
  } else {
    return NextResponse.json({ error: `Unknown action: ${action} / ${type}` }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
