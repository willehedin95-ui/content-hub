import type { createServerSupabase } from "@/lib/supabase-admin";
import { sendMessageWithInlineKeyboard } from "@/lib/telegram";

/**
 * Batched Telegram digest for autopilot-swiped concepts.
 *
 * Replaces the old per-swipe notification (one album + approve message per
 * concept) which spammed Telegram several times a day. Instead we notify
 * once when enough un-reviewed concepts have piled up.
 *
 * Sends when either:
 *   - >= DIGEST_THRESHOLD concepts are ready and un-notified, or
 *   - at least one un-notified concept has been waiting > MAX_WAIT_HOURS
 *     (so a slow trickle still surfaces instead of starving forever).
 *
 * Tracks notification state in image_jobs.review_notified_at.
 */

const DIGEST_THRESHOLD = 10;
const MAX_WAIT_HOURS = 72;

export async function maybeSendSwipeDigest(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  label: string,
): Promise<{ sent: boolean; pending: number }> {
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (!chatId) return { sent: false, pending: 0 };

  const { data: pending } = await db
    .from("image_jobs")
    .select("id, name, concept_number, created_at")
    .eq("workspace_id", workspaceId)
    .eq("source", "autopilot")
    .eq("status", "ready")
    .is("review_notified_at", null)
    .order("created_at", { ascending: true });

  const jobs = pending ?? [];
  if (jobs.length === 0) return { sent: false, pending: 0 };

  const oldestAgeMs = Date.now() - new Date(jobs[0].created_at as string).getTime();
  const overdue = oldestAgeMs > MAX_WAIT_HOURS * 3600_000;
  if (jobs.length < DIGEST_THRESHOLD && !overdue) {
    return { sent: false, pending: jobs.length };
  }

  const hubUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
  const listed = jobs.slice(0, 10).map((j) => `• #${j.concept_number} ${j.name}`);
  const lines = [
    `🔍 [${label}] ${jobs.length} new swiped concept${jobs.length === 1 ? "" : "s"} ready for review`,
    ``,
    ...listed,
  ];
  if (jobs.length > listed.length) lines.push(`… and ${jobs.length - listed.length} more`);
  lines.push(``);
  lines.push(`Review: ${hubUrl}/review`);

  await sendMessageWithInlineKeyboard(chatId, lines.join("\n"), []);

  await db
    .from("image_jobs")
    .update({ review_notified_at: new Date().toISOString() })
    .in("id", jobs.map((j) => j.id));

  return { sent: true, pending: jobs.length };
}
