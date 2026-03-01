import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCached, setCache } from "@/lib/pulse-cache";
import {
  isFreshdeskConfigured,
  fetchRecentTickets,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "@/lib/freshdesk";

// ---- Types ----

export interface SupportSummaryData {
  summary: string;
  generatedAt: string;
}

// ---- Constants ----

const CACHE_KEY = "pulse:support-summary";
const CACHE_TTL = 60 * 24; // 24 hours in minutes

// ---- Route: GET (cache-only read) ----

export async function GET() {
  try {
    const cached = await getCached<SupportSummaryData>(CACHE_KEY);
    return NextResponse.json(cached ?? null);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read summary cache" },
      { status: 500 }
    );
  }
}

// ---- Route: POST (generate summary) ----

export async function POST() {
  try {
    if (!isFreshdeskConfigured()) {
      return NextResponse.json(
        { error: "Freshdesk is not configured" },
        { status: 400 }
      );
    }

    // Return cached if available
    const cached = await getCached<SupportSummaryData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch last 7 days of tickets
    const tickets = await fetchRecentTickets(7);

    if (tickets.length === 0) {
      const result: SupportSummaryData = {
        summary: "Inga supportärenden hittades de senaste 7 dagarna.",
        generatedAt: new Date().toISOString(),
      };
      await setCache(CACHE_KEY, result, CACHE_TTL);
      return NextResponse.json(result);
    }

    // Build ticket digest for Claude
    const ticketLines = tickets.map((t) => {
      const priority = PRIORITY_LABELS[t.priority] ?? "Unknown";
      const status = STATUS_LABELS[t.status] ?? "Unknown";
      return `- [${priority}] [${status}] ${t.subject}`;
    });

    const prompt = `Du är en supportanalytiker för Swedish Balance, ett DTC e-handelsföretag som säljer sömnprodukter (HappySleep-kuddar) och kollagentillskott (Hydro13). Marknader: Sverige, Norge, Danmark.

Här är veckans ${tickets.length} supportärenden:

${ticketLines.join("\n")}

Skriv en sammanfattning på 3-4 meningar om veckans supportärenden. Identifiera de viktigaste ärendekategorierna och eventuella mönster. Var konkret och handlingsinriktad.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text from response
    const textBlock = message.content.find((b) => b.type === "text");
    const summary = textBlock?.text ?? "Kunde inte generera sammanfattning.";

    const result: SupportSummaryData = {
      summary,
      generatedAt: new Date().toISOString(),
    };

    await setCache(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate summary" },
      { status: 500 }
    );
  }
}
