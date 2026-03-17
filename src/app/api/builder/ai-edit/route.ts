import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/constants";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { html, instruction, language, product } = await req.json();

    if (!html || !instruction) {
      return NextResponse.json(
        { error: "Missing html or instruction" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an expert HTML editor for landing pages. You receive a snippet of HTML and an instruction describing what changes to make. Return ONLY the modified HTML — no explanations, no markdown fences, no commentary.

Rules:
- Preserve all existing HTML structure, classes, styles, and attributes unless the instruction specifically asks to change them.
- Preserve all <img> tags and their src/alt attributes unchanged unless specifically asked to modify them.
- Do NOT add, remove, or reorder HTML elements unless the instruction explicitly asks for it.
- Do NOT wrap your response in \`\`\`html fences or add any text outside the HTML.
- If the instruction asks to modify text content, only change the text — keep all surrounding tags and attributes.
- The page sells "${product || "a product"}" in the ${language || "English"} market.
- Keep the same language as the source HTML unless asked to translate.`;

    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the HTML to edit:\n\n${html}\n\nInstruction: ${instruction}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Strip markdown fences if Claude adds them despite instructions
    let result = textBlock.text.trim();
    if (result.startsWith("```html")) {
      result = result.slice(7);
    } else if (result.startsWith("```")) {
      result = result.slice(3);
    }
    if (result.endsWith("```")) {
      result = result.slice(0, -3);
    }
    result = result.trim();

    return NextResponse.json({ html: result });
  } catch (error) {
    console.error("AI edit error:", error);
    return NextResponse.json(
      { error: "AI edit failed" },
      { status: 500 }
    );
  }
}
