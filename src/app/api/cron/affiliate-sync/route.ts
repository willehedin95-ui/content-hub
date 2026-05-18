import { NextRequest, NextResponse } from "next/server";
import { syncAwin, syncAdtraction } from "@/lib/affiliate/sync";
import { sendTelegramNotification } from "@/lib/telegram";

// Weekly sync of affiliate program data from Awin + Adtraction.
// Pulls program lists, commission rates, EPC, status into affiliate_programs
// table so blog-autopilot can resolve brand mentions to live deep links.
//
// Requires env vars:
//   AWIN_API_TOKEN, AWIN_PUBLISHER_ID
//   ADTRACTION_API_TOKEN
// If a network token is missing, that network is skipped (not an error).

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = [];

  if (process.env.AWIN_API_TOKEN && process.env.AWIN_PUBLISHER_ID) {
    results.push(await syncAwin());
  } else {
    results.push({ network: "awin", fetched: 0, inserted: 0, updated: 0, errors: 0, error: "AWIN_API_TOKEN or AWIN_PUBLISHER_ID not set" });
  }

  if (process.env.ADTRACTION_API_TOKEN) {
    results.push(await syncAdtraction());
  } else {
    results.push({ network: "adtraction", fetched: 0, inserted: 0, updated: 0, errors: 0, error: "ADTRACTION_API_TOKEN not set" });
  }

  // Telegram summary
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      const lines = results.map((r) => {
        if (r.error) return `⛔ ${r.network}: ${r.error.slice(0, 80)}`;
        return `✅ ${r.network}: ${r.fetched} program (${r.inserted} nya, ${r.updated} uppdaterade)`;
      });
      const hasErrors = results.some((r) => r.error);
      const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
      if (totalFetched > 0 || hasErrors) {
        await sendTelegramNotification(
          chatId,
          `🤝 *Affiliate-sync*\n\n${lines.join("\n")}`
        );
      }
    }
  } catch (err) {
    console.warn("[affiliate-sync] Telegram failed:", err);
  }

  return NextResponse.json({ ok: true, results });
}
