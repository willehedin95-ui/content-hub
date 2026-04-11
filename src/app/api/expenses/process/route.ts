import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300;

interface ExtractedReceipt {
  filename: string;
  description: string;
  date: string | null;
  amount: number | null;
  currency: string | null;
}

interface BankTransaction {
  description: string;
  date: string;
  amount: number; // SEK
}

interface ExpenseRow {
  id: string;
  description: string;
  date: string;
  receiptAmount: number | null;
  receiptCurrency: string | null;
  sekAmount: number | null;
  vat: number | null;
  category: "monthly" | "one_time" | "facebook_ads" | "google_ads";
  receiptReady: boolean;
  note: string;
  matched: boolean;
  receiptFile: string | null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const formData = await req.formData();
  const month = formData.get("month") as string;
  if (!month) {
    return NextResponse.json({ error: "month is required" }, { status: 400 });
  }

  // Files are pre-classified by the client
  const receiptFiles: File[] = [];
  const bankStatementFiles: File[] = [];

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (key === "receipts") {
        receiptFiles.push(value);
      } else if (key === "bank_statements") {
        bankStatementFiles.push(value);
      }
    }
  }

  const client = new Anthropic({ apiKey });

  // Step 1: Extract data from each receipt (PDF or image)
  const receipts: ExtractedReceipt[] = [];
  for (const file of receiptFiles) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const ext = file.name.toLowerCase().split(".").pop();
      const isPdf = ext === "pdf";

      // Build the appropriate content block for PDF vs image
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileContent: any = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
        : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } };

      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            fileContent,
            {
              type: "text",
              text: `Extract from this invoice/receipt:
1. description: The vendor/service name (clean, short, e.g. "Shopify e-handelsplattform", "Klaviyo e-post", "Hostinger webbhotell")
2. date: Invoice/billing date in YYYY-MM-DD format
3. amount: Total amount charged
4. currency: Currency code (USD, SEK, EUR, etc.)

Return ONLY JSON: {"description": "...", "date": "...", "amount": 123.45, "currency": "USD"}
No markdown fences.`,
            },
          ],
        }],
      });

      const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const data = JSON.parse(cleaned);
      receipts.push({
        filename: file.name,
        description: data.description || file.name,
        date: data.date || null,
        amount: data.amount != null ? Number(data.amount) : null,
        currency: data.currency || null,
      });
    } catch (e) {
      console.error(`[expenses] Failed to analyze receipt ${file.name}:`, e);
      receipts.push({
        filename: file.name,
        description: file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
        date: null,
        amount: null,
        currency: null,
      });
    }
  }

  // Step 2: Extract transactions from bank statement screenshots
  let bankTransactions: BankTransaction[] = [];
  if (bankStatementFiles.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageContent: any[] = [];
      for (const file of bankStatementFiles) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString("base64");
        const mediaType = file.type === "image/png" ? "image/png" : "image/jpeg";
        imageContent.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        });
      }

      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text",
              text: `These are Nordea bank statement screenshots. Extract ALL debit transactions (purchases/charges).
For each transaction provide:
- description: Merchant/service name as shown
- date: Transaction date in YYYY-MM-DD format
- amount: Amount in SEK (positive number)

Only include debit/purchase transactions. Skip incoming transfers, salary deposits, and internal transfers.

Return ONLY a JSON array:
[{"description": "SHOPIFY*12345", "date": "2026-03-15", "amount": 789.23}, ...]
No markdown fences.`,
            },
          ],
        }],
      });

      const raw = res.content[0].type === "text" ? res.content[0].text : "[]";
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      bankTransactions = JSON.parse(cleaned);
    } catch (e) {
      console.error("[expenses] Failed to analyze bank statements:", e);
    }
  }

  // Step 3: Match receipts to bank transactions
  const usedBankIdx = new Set<number>();
  const expenses: ExpenseRow[] = receipts.map((receipt) => {
    let bestMatch: BankTransaction | null = null;
    let bestScore = 0;
    let bestIdx = -1;

    for (let i = 0; i < bankTransactions.length; i++) {
      if (usedBankIdx.has(i)) continue;
      const tx = bankTransactions[i];
      const score = matchScore(receipt.description, tx.description, receipt.date, tx.date);
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestMatch = tx;
        bestIdx = i;
      }
    }

    if (bestMatch && bestIdx >= 0) {
      usedBankIdx.add(bestIdx);
    }

    const id = crypto.randomUUID();
    return {
      id,
      description: receipt.description,
      date: receipt.date || bestMatch?.date || "",
      receiptAmount: receipt.amount,
      receiptCurrency: receipt.currency,
      sekAmount: bestMatch?.amount ?? null,
      vat: null,
      category: guessCategory(receipt.description) as ExpenseRow["category"],
      receiptReady: true,
      note: "",
      matched: !!bestMatch,
      receiptFile: receipt.filename,
    };
  });

  // Unmatched bank transactions (for reference)
  const unmatchedBank = bankTransactions
    .filter((_, i) => !usedBankIdx.has(i))
    .map((tx) => ({ description: tx.description, date: tx.date, amount: tx.amount }));

  return NextResponse.json({ expenses, unmatchedBank });
}

/** Fuzzy match score between receipt and bank transaction (0-1) */
function matchScore(
  receiptDesc: string,
  bankDesc: string,
  receiptDate: string | null,
  bankDate: string
): number {
  const r = receiptDesc.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
  const b = bankDesc.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);

  // Word overlap score
  let wordMatches = 0;
  for (const rw of r) {
    if (b.some((bw) => bw.includes(rw) || rw.includes(bw))) {
      wordMatches++;
    }
  }
  const nameScore = r.length > 0 ? wordMatches / r.length : 0;

  // Date proximity score
  let dateScore = 0.5; // default if no receipt date
  if (receiptDate && bankDate) {
    const rDate = new Date(receiptDate);
    const bDate = new Date(bankDate);
    const daysDiff = Math.abs(rDate.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff <= 3) dateScore = 1;
    else if (daysDiff <= 7) dateScore = 0.7;
    else if (daysDiff <= 14) dateScore = 0.4;
    else dateScore = 0.1;
  }

  return nameScore * 0.7 + dateScore * 0.3;
}

/** Guess expense category from description */
function guessCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("facebook") || d.includes("meta ads")) return "facebook_ads";
  if (d.includes("google ads") || d.includes("google advertising")) return "google_ads";

  // Common monthly subscriptions
  const monthlies = [
    "shopify", "klaviyo", "google e-post", "google workspace", "hostinger",
    "fillout", "lovable", "slack", "vercel", "zapier", "figma", "poe",
    "openai", "anthropic", "wisprflow", "wispr", "thinkific", "funnel",
    "mailreach", "higgsfield",
  ];
  if (monthlies.some((m) => d.includes(m))) return "monthly";

  return "one_time";
}
