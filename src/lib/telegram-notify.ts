import { sendMessage } from "./telegram";

function getChatId(): string | null {
  return process.env.TELEGRAM_NOTIFY_CHAT_ID || null;
}

/** Notify that a concept was successfully pushed to Meta */
export async function notifyPushSuccess(concept: {
  number: number | null;
  name: string;
  countries: string[];
}): Promise<void> {
  const chatId = getChatId();
  if (!chatId) return;

  const num = concept.number ? `#${concept.number}` : "";
  const countries = concept.countries.join(", ");
  await sendMessage(
    chatId,
    `✅ Auto-pushed ${num} ${concept.name} to Meta (${countries})`,
  );
}

/** Notify that a concept failed to push to Meta */
export async function notifyPushFailure(
  concept: { number: number | null; name: string },
  error: string
): Promise<void> {
  const chatId = getChatId();
  if (!chatId) return;

  const num = concept.number ? `#${concept.number}` : "";
  await sendMessage(
    chatId,
    `❌ Failed to auto-push ${num} ${concept.name}: ${error}\nWill retry next scheduled run.`,
  );
}

/** Notify daily summary of auto-push results */
export async function notifyPushSummary(results: {
  pushed: number;
  failed: number;
  queueRemaining: number;
  testingSlots: string;
}): Promise<void> {
  const chatId = getChatId();
  if (!chatId) return;

  const lines = [`📊 Pipeline auto-push summary:`];
  if (results.pushed > 0) lines.push(`  Pushed: ${results.pushed} concepts`);
  if (results.failed > 0) lines.push(`  Failed: ${results.failed} concepts`);
  lines.push(`  Queue: ${results.queueRemaining} waiting`);
  lines.push(`  Testing slots: ${results.testingSlots}`);

  await sendMessage(chatId, lines.join("\n"));
}
