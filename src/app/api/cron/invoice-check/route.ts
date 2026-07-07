import { NextRequest, NextResponse } from "next/server";
import { processInvoices } from "@/lib/invoice-mail";
import { sendMessage } from "@/lib/telegram";
import { trackedCronRoute } from "@/lib/cron-tracker";

export const maxDuration = 60;

function getChatId(): string {
  return process.env.TELEGRAM_NOTIFY_CHAT_ID || "";
}

async function handleCron(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processInvoices();
    console.log("[cron/invoice-check] Result:", result);

    // Send Telegram notification
    const chatId = getChatId();
    if (chatId && (result.forwarded > 0 || result.errors > 0)) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://contenthub.se";
      const parts: string[] = ["<b>Invoice Scanner</b>"];
      if (result.forwarded > 0) {
        parts.push(`${result.forwarded} auto-forwarded to Juni`);
      }
      if (result.errors > 0) {
        parts.push(`${result.errors} error${result.errors > 1 ? "s" : ""} - needs attention`);
      }
      if (result.remaining > 0) {
        parts.push(`${result.remaining} remaining (will process next run)`);
      }
      parts.push(`\n<a href="${appUrl}/invoices">Open Invoice Tracker</a>`);
      await sendMessage(chatId, parts.join("\n"), { parse_mode: "HTML" });
    }

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/invoice-check] Error:", msg);

    // Notify on cron failure
    const chatId = getChatId();
    if (chatId) {
      await sendMessage(chatId, `<b>Invoice Check Failed</b>\n${msg}`, { parse_mode: "HTML" }).catch(() => {});
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Cron-run tracking wrapper (audit 2026-07-07, I1)
export const GET = trackedCronRoute("invoice-check", handleCron);
