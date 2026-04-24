// src/lib/quiz-video-swipe.ts
// Video-based quiz swipe: upload a screen recording of an app onboarding
// (or web quiz walkthrough) and let Gemini extract the structure.

import crypto from "crypto";
import { createServerSupabase } from "./supabase-admin";
import { callGeminiVideo } from "./kie";
import { buildDefaultSettings } from "./quiz-defaults";
import { newId } from "./quiz-graph";
import type {
  QuizData,
  QuizSettings,
  QuizNode,
  QuizEdge,
  StepNode,
  SubEl,
} from "@/types/quiz";
import type { ImportResult } from "./quiz-swipe";

const VIDEO_BUCKET = "translated-images";
const VIDEO_PREFIX = "quiz-videos";

const SYSTEM_PROMPT = `You extract quiz / onboarding funnel structure from a screen recording into a strict JSON schema.

The video shows someone clicking through a mobile app or web quiz. Each screen the user sees is a "step" that should become one entry in the output.

Return a JSON object of shape:

{
  "title": string,                              // overall quiz / onboarding name
  "brandColors": {                              // derived from the dominant palette
    "background": string,                       // hex, e.g. "#FFFFFF"
    "textPrimary": string,
    "primaryBrand": string,                     // main accent color (buttons, highlights)
    "optionBackground": string                  // card/option background
  },
  "steps": [
    {
      "title": string,                          // main question or heading on the screen
      "paragraphs": string[],                   // supporting copy (optional; <= 3 items)
      "questionType": "single" | "multi" | "text_input" | "range" | "info" | "result",
      "options": [                              // for single/multi
        { "label": string, "emoji"?: string, "imageDescription"?: string }
      ],
      "inputType"?: "text" | "number" | "date", // for text_input
      "rangeMin"?: number,                      // for range
      "rangeMax"?: number,
      "rangeUnit"?: string,
      "customHtmlDescription"?: string          // describe any chart / infographic / testimonial slider / result card etc. the user might want to recreate (e.g. "animated line chart of collagen decline from 100% at age 20 to 40% at age 60 with a 'critical loss' badge"). Leave blank if the screen is just a standard question.
    }
  ]
}

Rules:
- Include every distinct screen the user sees. Do NOT skip info slides or loading screens, they're part of the funnel pacing.
- Do NOT invent options that weren't shown; transcribe what's on screen.
- Do NOT include system chrome (status bar, tab bar, app header beyond logo).
- Default questionType to "single" unless you clearly see the user select more than one option on that screen, OR the screen explicitly says "select all that apply" / "choose multiple" / "mark all". Asking "What breed is your dog?" is single.
- If the screen is clearly a result / profile / recommendation / chart page, mark questionType "result" and fill customHtmlDescription with a precise visual description of the content (colors, layout, specific numbers, graph shape). NEVER include implementation metadata in customHtmlDescription (e.g. "this appears as a modal", "shown over loading screen"). The description becomes literal placeholder text in the imported quiz.
- If each option card clearly displays an illustration / photo / icon beyond a single emoji, write a short imageDescription per option (e.g. "cartoon young puppy"). We can't extract the image but the description helps the author add one later. Do NOT invent imageDescriptions for text-only options.
- If the video only partially shows a long list (e.g. 50 breeds in a dropdown, only 5 visible while scrolled), include the visible labels. Mark questionType "single" and the importer will auto-pick dropdown layout when >=15 options.
- Strip emoji from the label into the "emoji" field when it's a single trailing emoji.
- Return ONLY valid JSON. No prose, no code fences.`;

export async function importVideoQuiz(
  opts: {
    videoPublicUrl: string;
    videoStoragePath: string;
    workspaceId: string;
    market: "se" | "dk" | "no";
    name?: string;
  },
): Promise<ImportResult> {
  const warnings: string[] = [];
  console.log("[quiz-video-swipe] Calling Gemini on", opts.videoPublicUrl);
  const { text } = await callGeminiVideo(
    opts.videoPublicUrl,
    SYSTEM_PROMPT,
    "Extract the full step-by-step quiz / onboarding structure from this recording. Return JSON per the schema.",
  );

  // Strip potential code fences
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  type VideoStep = {
    title?: string;
    paragraphs?: string[];
    questionType?: "single" | "multi" | "text_input" | "range" | "info" | "result";
    options?: { label: string; emoji?: string; imageDescription?: string }[];
    inputType?: "text" | "number" | "date";
    rangeMin?: number;
    rangeMax?: number;
    rangeUnit?: string;
    customHtmlDescription?: string;
  };
  type VideoOut = {
    title?: string;
    brandColors?: {
      background?: string;
      textPrimary?: string;
      primaryBrand?: string;
      optionBackground?: string;
    };
    steps?: VideoStep[];
  };

  let parsed: VideoOut;
  try {
    parsed = JSON.parse(cleaned) as VideoOut;
  } catch (err) {
    throw new Error(
      `Gemini returned unparsable JSON: ${(err as Error).message}. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  if (!parsed.steps || parsed.steps.length === 0) {
    throw new Error("Gemini found no steps in the video. Check that the recording shows actual quiz/onboarding screens.");
  }

  const startId = newId("start");
  const exitId = newId("exit");
  const nodes: Record<string, QuizNode> = {
    [startId]: {
      id: startId,
      kind: "start",
      size: { width: 180, height: 80 },
      position: { x: 0, y: 200 },
    },
    [exitId]: {
      id: exitId,
      kind: "exit",
      name: "Exit",
      size: { width: 180, height: 80 },
      position: { x: 300 + parsed.steps.length * 340, y: 200 },
      redirectUrl: "",
    },
  };

  const stepNodes: StepNode[] = parsed.steps.map((s, i) => {
    const subEls: SubEl[] = [];
    if (s.title) {
      subEls.push({
        id: newId("el"),
        kind: "title",
        text: s.title,
        isRichText: true,
        contentFormat: "html",
      });
    }
    for (const p of s.paragraphs ?? []) {
      subEls.push({
        id: newId("el"),
        kind: "text",
        text: p,
        isRichText: true,
        contentFormat: "html",
      });
    }
    if (s.customHtmlDescription) {
      // Describe the block as a placeholder comment so the editor + adapt
      // layer can rebuild it later; the runtime currently renders it as
      // plain text until the user extends the block.
      subEls.push({
        id: newId("el"),
        kind: "custom_html",
        html: `<!-- gemini: regenerate this block in the editor.\n${escapeHtmlComment(s.customHtmlDescription)}\n--><div style="padding: 20px; border: 2px dashed rgba(0,0,0,0.15); border-radius: 12px; color: rgba(0,0,0,0.5); font-size: 14px; line-height: 1.5; text-align: center;"><strong>Custom block placeholder</strong><br/>${escapeHtml(s.customHtmlDescription)}</div>`,
      });
    }
    if (s.questionType === "single" || s.questionType === "multi") {
      const opts = (s.options ?? []).filter((o) => o.label && o.label.length < 200);
      if (opts.length >= 2) {
        // Dropdown only for genuinely long lists. Below 15 options a chip/list
        // layout is both more tappable and matches how the source app likely
        // renders. Keep the dropdown escape hatch for 15+ items (breeds,
        // countries, symptom lookups).
        const useDropdown = opts.length >= 15;
        const withImageDesc = opts.filter((o) => o.imageDescription && o.imageDescription.trim()).length;
        const useImageCards = !useDropdown && withImageDesc >= opts.length * 0.6;
        subEls.push({
          id: newId("el"),
          kind: "question",
          kindOf: s.questionType,
          layout: useDropdown ? "dropdown" : useImageCards ? "image_cards" : "list",
          options: opts.map((o) => ({
            id: newId("opt"),
            label: o.label,
            ...(o.emoji ? { emoji: o.emoji } : {}),
            ...(o.imageDescription && o.imageDescription.trim() ? { imageDescription: o.imageDescription.trim() } : {}),
          })),
          ...(useDropdown ? { searchable: true } : {}),
        });
        if (useImageCards) {
          warnings.push(
            `Step ${i + 1} "${s.title ?? "(untitled)"}" renders as image cards - option images are placeholders (Gemini can describe but not download). Drop in real illustrations from the product bank.`,
          );
        }
      } else if (opts.length === 1) {
        warnings.push(
          `Step ${i + 1} "${s.title ?? "(untitled)"}" has only 1 option — probably a data-capture that Gemini didn't label as text_input. Review.`,
        );
      }
    } else if (s.questionType === "text_input") {
      subEls.push({
        id: newId("el"),
        kind: "text_input",
        variable: `step_${i + 1}`,
        inputType: s.inputType ?? "text",
      });
    } else if (s.questionType === "range") {
      subEls.push({
        id: newId("el"),
        kind: "range_slider",
        variable: `step_${i + 1}`,
        min: s.rangeMin ?? 0,
        max: s.rangeMax ?? 100,
        unit: s.rangeUnit,
      });
    }
    const stepNameWords = (s.title ?? "").trim().split(/\s+/).slice(0, 3).join(" ");
    return {
      id: newId("step"),
      kind: "step",
      name: stepNameWords || `Step ${i + 1}`,
      size: { width: 280, height: 360 },
      position: { x: 300 + i * 340, y: 100 },
      rotation: 0,
      subEls,
    };
  });

  for (const sn of stepNodes) nodes[sn.id] = sn;

  const edges: Record<string, QuizEdge> = {};
  const eStart = newId("edge");
  edges[eStart] = { id: eStart, from: startId, to: stepNodes[0].id, condition: { kind: "default" } };
  for (let i = 0; i < stepNodes.length - 1; i++) {
    const eid = newId("edge");
    edges[eid] = { id: eid, from: stepNodes[i].id, to: stepNodes[i + 1].id, condition: { kind: "default" } };
  }
  const eLast = newId("edge");
  edges[eLast] = { id: eLast, from: stepNodes[stepNodes.length - 1].id, to: exitId, condition: { kind: "default" } };

  const quizData: QuizData = {
    id: `quiz_${Date.now().toString(36)}`,
    nodes,
    edges,
    camera: { x: 0, y: 0, z: 1 },
  };

  // Apply brand colors if Gemini detected any
  const settings: QuizSettings = buildDefaultSettings();
  if (parsed.brandColors) {
    if (isHexColor(parsed.brandColors.background))
      settings.brandColors.background = parsed.brandColors.background!;
    if (isHexColor(parsed.brandColors.textPrimary))
      settings.brandColors.textPrimary = parsed.brandColors.textPrimary!;
    if (isHexColor(parsed.brandColors.primaryBrand))
      settings.brandColors.primaryBrand = parsed.brandColors.primaryBrand!;
    if (isHexColor(parsed.brandColors.optionBackground))
      settings.brandColors.optionBackground = parsed.brandColors.optionBackground!;
  }
  const quizName = opts.name ?? parsed.title ?? "Imported video quiz";
  settings.metadata.title = quizName;

  warnings.push(
    `Imported via Gemini video extractor (${stepNodes.length} steps). Custom visual blocks are placeholders — rebuild them in the editor. Review carefully for hallucinated options.`,
  );

  const db = createServerSupabase();
  const baseSlug =
    quizName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "quiz";
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

  const { data: inserted, error } = await db
    .from("quizzes")
    .insert({
      id: crypto.randomUUID(),
      workspace_id: opts.workspaceId,
      market: opts.market,
      slug,
      name: quizName,
      status: "draft",
      data: quizData,
      settings,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to save quiz: ${error.message}`);

  console.log("[quiz-video-swipe] Saved quiz", (inserted as { id: string }).id);
  console.log("[quiz-video-swipe] Video storage path (kept for reference):", opts.videoStoragePath);

  return {
    quizId: (inserted as { id: string }).id,
    method: "llm", // reuse 'llm' since Gemini is an AI extractor
    importedSteps: stepNodes.length,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Upload helper — used by the API route to push the video blob into storage
// and return a signed public URL Gemini can download.
// ---------------------------------------------------------------------------

export async function uploadVideoToStorage(
  file: Buffer,
  filename: string,
  contentType: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const db = createServerSupabase();
  const ext = filename.includes(".") ? filename.split(".").pop() : "mp4";
  const safeName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${VIDEO_PREFIX}/${safeName}`;

  const { error } = await db.storage
    .from(VIDEO_BUCKET)
    .upload(storagePath, file, {
      contentType,
      upsert: false,
    });
  if (error) throw new Error(`Video upload failed: ${error.message}`);

  const { data } = db.storage.from(VIDEO_BUCKET).getPublicUrl(storagePath);
  return { publicUrl: data.publicUrl, storagePath };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function isHexColor(v: string | undefined): v is string {
  return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlComment(s: string): string {
  return s.replace(/--/g, "- -");
}
