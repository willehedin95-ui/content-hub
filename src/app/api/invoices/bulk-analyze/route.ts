import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";
import type { InvoiceService } from "@/types";

interface AnalysisResult {
  filename: string;
  fileIndex: number;
  serviceName: string | null;
  serviceId: string | null;
  period: string | null;
  amount: number | null;
  currency: string | null;
  confidence: "high" | "medium" | "low";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const formData = await req.formData();
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Load all services for matching
  const db = createServerSupabase();
  const { data: services } = await db
    .from("invoice_services")
    .select("*")
    .eq("is_active", true)
    .order("name");

  const serviceList = (services ?? []) as InvoiceService[];
  // Build service list with IDs for Claude to match directly
  const serviceListForPrompt = serviceList
    .map((s) => `- "${s.name}" (id: ${s.id})`)
    .join("\n");

  const client = new Anthropic({ apiKey });
  const results: AnalysisResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");

      // Send PDF directly to Claude — it supports PDF documents natively
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: `Analyze this invoice/receipt PDF and extract:
1. company_name: The company that issued this invoice (the vendor/service provider, NOT the customer)
2. service_id: Match this invoice to the BEST matching service from the list below. Be precise — e.g. if the invoice is for API usage, match "OpenAI API" not "OpenAI". Pick the most specific match.
3. period: The billing period in YYYY-MM format. Look for invoice date, billing period, or statement date. If you see a specific date like "2026-02-15", the period is "2026-02". If unclear, use the most recent date mentioned.
4. amount: The total amount charged (the final total, not subtotals)
5. currency: The currency code (USD, SEK, EUR, etc.)
6. confidence: "high" if all fields are clearly found, "medium" if you had to guess something, "low" if the text is unclear

Known services:
${serviceListForPrompt}

Return ONLY a JSON object like:
{"company_name": "Anthropic", "service_id": "abc-123", "period": "2026-02", "amount": 29.99, "currency": "USD", "confidence": "high"}

Set service_id to null if no service matches well. No markdown fences.`,
              },
            ],
          },
        ],
      });

      const raw = res.content[0].type === "text" ? res.content[0].text : "";
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const analysis = JSON.parse(cleaned);

      // Validate the service_id Claude returned actually exists
      const matchedService = analysis.service_id
        ? serviceList.find((s) => s.id === analysis.service_id) || null
        : null;

      results.push({
        filename: file.name,
        fileIndex: i,
        serviceName: analysis.company_name || null,
        serviceId: matchedService?.id || null,
        period: analysis.period || null,
        amount: analysis.amount != null ? Number(analysis.amount) : null,
        currency: analysis.currency || null,
        confidence: analysis.confidence || "low",
      });
    } catch (e) {
      console.error(`[bulk-analyze] Failed to analyze ${file.name}:`, e);
      results.push({
        filename: file.name,
        fileIndex: i,
        serviceName: null,
        serviceId: null,
        period: null,
        amount: null,
        currency: null,
        confidence: "low",
      });
    }
  }

  return NextResponse.json({ results, services: serviceList });
}
