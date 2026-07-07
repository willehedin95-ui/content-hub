/**
 * Helper for tracking deploy failures (sitemap, homepage, RSS, etc.).
 *
 * Previously these were fire-and-forget with `.catch(() => {})` handlers, which
 * meant a failure silently left the blog homepage/RSS/sitemap stale with no
 * alert. After the 2026-04-16 halsobladet manifest wipe incident we now:
 *
 *  1. Await each deploy step inline.
 *  2. On failure: log to `autopilot_actions` with action_type="deploy_failure"
 *     + send a Telegram alert.
 *  3. Do NOT rethrow — parent flow continues. One stale sub-step shouldn't
 *     block e.g. the main translation publish from being marked "published".
 *
 * See `.claude/tasks/resilience-audit-2026-04-16.md` (P0-3).
 */
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendTelegramNotification, escapeHtml } from "@/lib/telegram";

export type DeployStep =
  | "sitemap"
  | "blog_homepage"
  | "blog_rss"
  | "gsc_sitemap_submit"
  | "retroactive_links"
  | "page_screenshot";

/**
 * Run a deploy step and record the failure if it throws.
 * Never rethrows — always returns T | null.
 */
export async function runDeployStep<T>(
  step: DeployStep,
  context: { language: string; workspaceId?: string | null; targetId?: string },
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[deploy-failure] ${step} (${context.language}):`, message);

    // Log to autopilot_actions — never throw from here
    if (context.workspaceId) {
      try {
        const db = createServerSupabase();
        await db.from("autopilot_actions").insert({
          workspace_id: context.workspaceId,
          action_type: "deploy_failure",
          target_id: context.targetId ?? step,
          target_name: `${step} (${context.language})`,
          details: { step, language: context.language, error: message },
          success: false,
          error_message: message,
        });
      } catch (logErr) {
        console.error(`[deploy-failure] Failed to log to DB:`, logErr);
      }
    }

    // Send Telegram alert — never throw from here
    try {
      const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
      if (chatId) {
        const title = {
          sitemap: "Sitemap deploy failed",
          blog_homepage: "Blog homepage deploy failed",
          blog_rss: "Blog RSS deploy failed",
          gsc_sitemap_submit: "GSC sitemap submit failed",
          retroactive_links: "Retroactive link update failed",
          page_screenshot: "Page screenshot failed",
        }[step];
        await sendTelegramNotification(
          chatId,
          `🚨 <b>${title}</b>\n\n` +
            `Language: <code>${context.language}</code>\n` +
            `Error: <code>${escapeHtml(message.slice(0, 500))}</code>`
        );
      }
    } catch (tgErr) {
      console.error(`[deploy-failure] Telegram alert failed:`, tgErr);
    }

    return null;
  }
}
