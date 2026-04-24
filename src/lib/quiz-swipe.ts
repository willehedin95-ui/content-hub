// src/lib/quiz-swipe.ts
// Quiz Swiper — import a competitor quiz into our QuizData format.
//
// Strategy order (per spec):
//   1. Plain fetch + regex extract of window.__CLARFLOW_DATA__ from raw HTML
//   2. If that fails and __CLARFLOW_DATA__ is absent: puppeteer generic walk
//
// All browser-free helpers (remapClarflowIds) are exported for unit testing.

import crypto from "crypto";
import { createServerSupabase } from "./supabase-admin";
import { buildDefaultSettings } from "./quiz-defaults";
import { newId } from "./quiz-graph";
import type {
  QuizData,
  QuizSettings,
  QuizNode,
  StepNode,
  ExitNode,
  StartNode,
  SubEl,
  QuestionOption,
  QuizEdge,
} from "@/types/quiz";

// ---------------------------------------------------------------------------
// Clarflow raw shape (as it appears in window.__CLARFLOW_DATA__)
// ---------------------------------------------------------------------------

export interface ClarflowOption {
  id: string;
  label: string;
  emoji?: string;
  imageUrl?: string;
  value?: string;
}

export interface ClarflowSubEl {
  kind: "title" | "text" | "question" | "image" | "custom_html" | "loading";
  text?: string;
  isRichText?: boolean;
  contentFormat?: string;
  // question
  kindOf?: "single" | "multi";
  layout?: "list" | "cards" | "image_cards";
  options?: ClarflowOption[];
  // image
  url?: string;
  alt?: string;
  // custom_html
  html?: string;
  // loading
  style?: string;
  seconds?: number;
}

export interface ClarflowStepNode {
  id: string;
  kind: "step";
  name: string;
  size: { width: number; height: number };
  position: { x: number; y: number };
  rotation: number;
  subEls: ClarflowSubEl[];
  variantGroupId?: string;
  trafficPct?: number;
}

export interface ClarflowExitNode {
  id: string;
  kind: "exit";
  name: string;
  size: { width: number; height: number };
  position: { x: number; y: number };
  redirectUrl: string;
}

export interface ClarflowStartNode {
  id: string;
  kind: "start";
  size: { width: number; height: number };
  position: { x: number; y: number };
}

export type ClarflowNode = ClarflowStepNode | ClarflowExitNode | ClarflowStartNode;

export interface ClarflowEdge {
  id: string;
  from: string;
  to: string;
}

export interface ClarflowSettings {
  brandLogo?: { url: string; enabled: boolean };
  brandColors?: {
    background?: string;
    textPrimary?: string;
    textSecondary?: string;
    primaryBrand?: string;
    optionBackground?: string;
  };
  fontSettings?: { enabled?: boolean; fontFamily?: string };
  progressBar?: boolean;
  stepProgressCount?: boolean;
  backNavigation?: boolean;
  themePreset?: string;
  metadata?: { title?: string; description?: string; ogImage?: string; favicon?: string };
}

export interface ClarflowData {
  id: string;
  nodes: Record<string, ClarflowNode>;
  edges: Record<string, ClarflowEdge>;
  title: string;
  settings?: ClarflowSettings;
  camera?: { x: number; y: number; z: number };
  isPublic?: boolean;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// ImportResult
// ---------------------------------------------------------------------------

export interface ImportResult {
  quizId: string;
  method: "clarflow" | "heyflow" | "generic";
  importedSteps: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// remapClarflowIds — pure function, exported for testing
// ---------------------------------------------------------------------------

/**
 * Deep-clones a ClarflowData payload and remaps every id (nodes, edges,
 * subEls, options, variantGroupIds) to our internal newId() format.
 * Returns a QuizData ready for DB insertion.
 */
export function remapClarflowIds(cf: ClarflowData): QuizData {
  // 1. Build old->new id maps for nodes and variant groups
  const nodeIdMap = new Map<string, string>();
  const variantGroupIdMap = new Map<string, string>();

  for (const [oldId, node] of Object.entries(cf.nodes)) {
    let newNodeId: string;
    if (node.kind === "start") newNodeId = newId("start");
    else if (node.kind === "exit") newNodeId = newId("exit");
    else newNodeId = newId("step");
    nodeIdMap.set(oldId, newNodeId);

    if (node.kind === "step" && node.variantGroupId) {
      if (!variantGroupIdMap.has(node.variantGroupId)) {
        variantGroupIdMap.set(node.variantGroupId, newId("vg"));
      }
    }
  }

  // 2. Remap nodes
  const newNodes: Record<string, QuizNode> = {};

  for (const [oldId, node] of Object.entries(cf.nodes)) {
    const mappedId = nodeIdMap.get(oldId)!;

    if (node.kind === "start") {
      const startNode: StartNode = {
        id: mappedId,
        kind: "start",
        size: { width: node.size.width, height: node.size.height },
        position: { x: node.position.x, y: node.position.y },
      };
      newNodes[mappedId] = startNode;
    } else if (node.kind === "exit") {
      const exitNode: ExitNode = {
        id: mappedId,
        kind: "exit",
        name: node.name,
        size: { width: node.size.width, height: node.size.height },
        position: { x: node.position.x, y: node.position.y },
        redirectUrl: node.redirectUrl,
      };
      newNodes[mappedId] = exitNode;
    } else {
      // step
      const stepNode: StepNode = {
        id: mappedId,
        kind: "step",
        name: node.name,
        size: { width: node.size.width, height: node.size.height },
        position: { x: node.position.x, y: node.position.y },
        rotation: node.rotation ?? 0,
        subEls: remapSubEls(node.subEls ?? []),
      };
      if (node.variantGroupId) {
        stepNode.variantGroupId = variantGroupIdMap.get(node.variantGroupId)!;
      }
      if (typeof node.trafficPct === "number") {
        stepNode.trafficPct = node.trafficPct;
      }
      newNodes[mappedId] = stepNode;
    }
  }

  // 3. Remap edges
  const newEdges: Record<string, QuizEdge> = {};
  for (const [, edge] of Object.entries(cf.edges)) {
    const newEdgeId = newId("edge");
    const fromMapped = nodeIdMap.get(edge.from);
    const toMapped = nodeIdMap.get(edge.to);
    if (!fromMapped || !toMapped) continue; // skip orphaned edges
    newEdges[newEdgeId] = {
      id: newEdgeId,
      from: fromMapped,
      to: toMapped,
      condition: { kind: "default" },
    };
  }

  // 4. Build QuizData
  const quizData: QuizData = {
    id: `quiz_${Date.now().toString(36)}`,
    nodes: newNodes,
    edges: newEdges,
    camera: cf.camera ?? { x: 0, y: 0, z: 1 },
  };

  return quizData;
}

// ---------------------------------------------------------------------------
// remapSubEls — assign new ids to every subEl and its options
// ---------------------------------------------------------------------------

function remapSubEls(cfSubEls: ClarflowSubEl[]): SubEl[] {
  return cfSubEls.map((el): SubEl => {
    const id = newId("el");
    switch (el.kind) {
      case "title":
        return {
          id,
          kind: "title",
          text: el.text ?? "",
          isRichText: true,
          contentFormat: "html",
        };
      case "text":
        return {
          id,
          kind: "text",
          text: el.text ?? "",
          isRichText: true,
          contentFormat: "html",
        };
      case "question": {
        const options: QuestionOption[] = (el.options ?? []).map((opt) => ({
          id: newId("opt"),
          label: opt.label,
          ...(opt.emoji ? { emoji: opt.emoji } : {}),
          ...(opt.imageUrl ? { imageUrl: opt.imageUrl } : {}),
          ...(opt.value ? { value: opt.value } : {}),
        }));
        return {
          id,
          kind: "question",
          kindOf: el.kindOf ?? "single",
          layout: el.layout ?? "list",
          options,
        };
      }
      case "image":
        return {
          id,
          kind: "image",
          url: el.url ?? "",
          alt: el.alt ?? "",
        };
      case "custom_html":
        return {
          id,
          kind: "custom_html",
          html: el.html ?? "",
        };
      case "loading":
        return {
          id,
          kind: "loading",
          text: el.text ?? "Loading...",
          style: el.style ?? "dots",
          seconds: el.seconds ?? 3,
        };
      default:
        // Unknown kind — wrap as custom_html
        return {
          id,
          kind: "custom_html",
          html: `<!-- unknown subEl kind: ${(el as ClarflowSubEl).kind} -->`,
        };
    }
  });
}

// ---------------------------------------------------------------------------
// mapClarflowSettings — convert Clarflow settings to our QuizSettings
// ---------------------------------------------------------------------------

function mapClarflowSettings(cf: ClarflowData): QuizSettings {
  const defaults = buildDefaultSettings();
  const s = cf.settings ?? {};

  return {
    ...defaults,
    brandLogo: s.brandLogo ?? defaults.brandLogo,
    brandColors: {
      background: s.brandColors?.background ?? defaults.brandColors.background,
      textPrimary: s.brandColors?.textPrimary ?? defaults.brandColors.textPrimary,
      textSecondary: s.brandColors?.textSecondary ?? defaults.brandColors.textSecondary,
      primaryBrand: s.brandColors?.primaryBrand ?? defaults.brandColors.primaryBrand,
      optionBackground: s.brandColors?.optionBackground ?? defaults.brandColors.optionBackground,
    },
    fontSettings: {
      enabled: s.fontSettings?.enabled ?? defaults.fontSettings.enabled,
      fontFamily: s.fontSettings?.fontFamily ?? defaults.fontSettings.fontFamily,
    },
    progressBar: s.progressBar ?? defaults.progressBar,
    stepProgressCount: s.stepProgressCount ?? defaults.stepProgressCount,
    backNavigation: s.backNavigation ?? defaults.backNavigation,
    metadata: {
      title: s.metadata?.title ?? cf.title ?? defaults.metadata.title,
      description: s.metadata?.description ?? defaults.metadata.description,
      ...(s.metadata?.ogImage ? { ogImage: s.metadata.ogImage } : {}),
      ...(s.metadata?.favicon ? { favicon: s.metadata.favicon } : {}),
    },
    providers: defaults.providers,
    redirectUrl: defaults.redirectUrl,
  };
}

// ---------------------------------------------------------------------------
// extractClarflowDataFromHtml — regex extraction from raw HTML source
// ---------------------------------------------------------------------------

function extractClarflowDataFromHtml(html: string): ClarflowData | null {
  // Clarflow embeds: window.__CLARFLOW_DATA__ = {...};
  // We look for the JSON blob following the variable assignment.
  const match = html.match(
    /window\.__CLARFLOW_DATA__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|window\.|$)/
  );
  if (!match) return null;

  try {
    const raw = match[1];
    const parsed = JSON.parse(raw) as ClarflowData;
    if (!parsed || typeof parsed !== "object" || !parsed.nodes) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// rehostImages — download external images and upload to Supabase storage
// ---------------------------------------------------------------------------

async function rehostImages(
  quizData: QuizData,
  quizId: string,
  warnings: string[]
): Promise<QuizData> {
  const db = createServerSupabase();
  const nodes = { ...quizData.nodes };

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.kind !== "step") continue;

    const updatedSubEls = await Promise.all(
      node.subEls.map(async (el): Promise<SubEl> => {
        if (el.kind !== "image" || !el.url || el.url.startsWith("data:")) return el;

        try {
          const imageRes = await fetch(el.url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!imageRes.ok) {
            warnings.push(`Image re-host failed (${imageRes.status}): ${el.url}`);
            return el;
          }
          const buf = await imageRes.arrayBuffer();
          const contentType = imageRes.headers.get("content-type") ?? "image/jpeg";
          const ext = contentType.split("/").pop()?.split(";")[0] ?? "jpg";
          const hash = crypto.createHash("sha256").update(Buffer.from(buf)).digest("hex").slice(0, 16);
          const path = `quiz-assets/${quizId}/${hash}.${ext}`;

          const { error } = await db.storage
            .from("translated-images")
            .upload(path, buf, {
              contentType,
              upsert: true,
            });

          if (error) {
            warnings.push(`Image upload failed for ${el.url}: ${error.message}`);
            return el;
          }

          const { data: urlData } = db.storage.from("translated-images").getPublicUrl(path);
          return { ...el, url: urlData.publicUrl };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Image re-host error for ${el.url}: ${msg}`);
          return el;
        }
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- node type guard already applied
    nodes[nodeId] = { ...(node as StepNode), subEls: updatedSubEls };
  }

  return { ...quizData, nodes };
}

// ---------------------------------------------------------------------------
// saveQuizToDb — insert into quizzes table, return the row id
// ---------------------------------------------------------------------------

async function saveQuizToDb(
  quizData: QuizData,
  settings: QuizSettings,
  opts: {
    workspaceId: string;
    market: "se" | "dk" | "no";
    name: string;
  }
): Promise<string> {
  const db = createServerSupabase();
  const baseSlug = opts.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "quiz";
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

  const { data, error } = await db
    .from("quizzes")
    .insert({
      id: crypto.randomUUID(),
      workspace_id: opts.workspaceId,
      market: opts.market,
      slug,
      name: opts.name,
      status: "draft",
      data: quizData,
      settings,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to save quiz: ${error.message}`);
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// importClarflowQuiz — fast-path: fetch HTML and extract __CLARFLOW_DATA__
// ---------------------------------------------------------------------------

export async function importClarflowQuiz(
  url: string,
  workspaceId: string,
  market: "se" | "dk" | "no",
  name?: string
): Promise<ImportResult | null> {
  const warnings: string[] = [];

  // Step 1: plain fetch
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // Step 2: extract __CLARFLOW_DATA__
  const cfData = extractClarflowDataFromHtml(html);
  if (!cfData) return null;

  // Step 3: remap IDs
  let quizData = remapClarflowIds(cfData);

  // Count step nodes
  const stepCount = Object.values(quizData.nodes).filter((n) => n.kind === "step").length;
  if (stepCount === 0) return null;

  // Step 4: re-host images (best effort, failures are warnings)
  const quizId = quizData.id;
  quizData = await rehostImages(quizData, quizId, warnings);

  // Step 5: build settings from Clarflow settings
  const settings = mapClarflowSettings(cfData);

  // Step 6: derive name
  const quizName = name ?? cfData.title ?? "Imported Quiz";

  // Step 7: save to DB
  const savedId = await saveQuizToDb(quizData, settings, {
    workspaceId,
    market,
    name: quizName,
  });

  return {
    quizId: savedId,
    method: "clarflow",
    importedSteps: stepCount,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Heyflow types — raw data-config JSON shapes
// ---------------------------------------------------------------------------

interface HeyflowOption {
  id: string;
  label: string;
  emoji?: string | null;
  image?: string | null;
}

interface HeyflowBlockConfig {
  blockName?: string;
  blockId?: string;
  blockType?: string;
  // rich-text
  content?: string;
  // multiple-choice
  options?: HeyflowOption[];
  multiselect?: boolean;
  autoRedirect?: boolean;
  systemLabel?: string;
  next?: string;
  // image
  url?: string;
  imageUrl?: string;
  alt?: string;
  src?: string;
  // loader
  text?: string;
  seconds?: number;
  duration?: number;
  // generic-button
  label?: string;
  // photo-carousel: Heyflow may use `items`, `images`, or `slides`
  items?: Array<{ url?: string; src?: string; alt?: string }>;
  images?: Array<{ url?: string; src?: string; alt?: string }>;
  slides?: Array<{ url?: string; src?: string; alt?: string }>;
}

// ---------------------------------------------------------------------------
// isHeyflowHtml — exported for testing: static detection
// ---------------------------------------------------------------------------

export function isHeyflowHtml(html: string): boolean {
  if (!html) return false;
  // Multiple signals — any one is sufficient
  if (html.includes('data-is-heyflow-script="true"')) return true;
  if (html.includes("assets.prd.heyflow.com")) return true;
  if (html.includes('<meta name="generator" content="Heyflow"')) return true;
  if (html.includes("window.heyflow")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// parseHeyflowHtml — exported for testing: pure HTML parser (no network)
// ---------------------------------------------------------------------------

export function parseHeyflowHtml(html: string): {
  data: QuizData;
  settings: QuizSettings;
  title: string;
  warnings: string[];
} {
  // Dynamic require so jsdom is not bundled in the Edge runtime / client builds
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require("jsdom") as typeof import("jsdom");

  const dom = new JSDOM(html);
  const document = dom.window.document;
  const warnings: string[] = [];

  // --- title & OG image ---
  const pageTitle = document.title || "Imported Quiz";
  const ogImageMeta = document.querySelector('meta[property="og:image"]');
  const ogImage = ogImageMeta?.getAttribute("content") ?? undefined;

  // --- font detection ---
  let fontFamily = "Inter";
  const fontLinks = Array.from(document.querySelectorAll('link[href*="font"], link[href*="Font"]'));
  if (fontLinks.length > 0) {
    const href = fontLinks[0].getAttribute("href") ?? "";
    // Try to extract font family name from URL: e.g. "GalanoGrotesque", "Poppins"
    const familyMatch = href.match(/family=([^&:+]+)/i) || href.match(/\/([A-Z][a-z]+(?:[A-Z][a-z]+)*)(?:\.|\?)/);
    if (familyMatch) {
      fontFamily = decodeURIComponent(familyMatch[1]).replace(/\+/g, " ");
    }
  }

  // --- collect screens ---
  // Heyflow section names: screen-<hex>
  const sections = Array.from(
    document.querySelectorAll('section[name^="screen-"]')
  ).filter((el) => /^screen-[a-f0-9]+$/i.test(el.getAttribute("name") ?? ""));

  // Build a map from screen name -> our step id (assigned later)
  const screenNameToStepId = new Map<string, string>();
  const screenStepIds: string[] = [];

  // First pass: assign step IDs in DOM order
  for (const section of sections) {
    const screenName = section.getAttribute("name") ?? "";
    const stepId = newId("step");
    screenNameToStepId.set(screenName, stepId);
    screenStepIds.push(stepId);
  }

  // Collect conditional edges (from multiple-choice inputs with data-destination)
  interface PendingCondEdge {
    fromStepId: string;
    destScreenName: string;
    questionElId: string;
    optionId: string;
  }
  const pendingCondEdges: PendingCondEdge[] = [];

  // Second pass: build step nodes
  const stepNodes: StepNode[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const stepId = screenStepIds[i];
    const screenName = section.getAttribute("name") ?? "";

    // Derive step name: try to find h1/h2 text from rich-text data-config.content first,
    // then fall back to DOM querySelector (for cases where heading is inline), then screen name.
    let headingText = "";
    // Check rich-text blocks for content with h1/h2
    const richTextBlocks = Array.from(section.querySelectorAll('[data-blocktype="rich-text"] [data-config]'));
    for (const rtEl of richTextBlocks) {
      try {
        const cfg = JSON.parse(rtEl.getAttribute("data-config") ?? "{}") as HeyflowBlockConfig;
        if (cfg.content) {
          // Parse the content HTML to extract heading text
          const contentDom = new JSDOM(cfg.content);
          const heading = contentDom.window.document.querySelector("h1, h2");
          if (heading) {
            headingText = heading.textContent?.trim() ?? "";
            break;
          }
        }
      } catch {
        // ignore
      }
    }
    // Fallback: check rendered DOM (for quizzes that embed heading directly)
    if (!headingText) {
      const firstHeading = section.querySelector("h1, h2");
      headingText = firstHeading?.textContent?.trim() ?? "";
    }
    const stepName = headingText
      ? headingText.split(/\s+/).slice(0, 5).join(" ")
      : screenName;

    // Walk blocks in DOM order
    const blocks = Array.from(section.querySelectorAll('[data-blocktype]'));
    const subEls: SubEl[] = [];
    let isFirstRichText = true;

    for (const block of blocks) {
      const blockType = block.getAttribute("data-blocktype") ?? "";
      // Inner div with data-config
      const configEl = block.querySelector("[data-config]");
      let config: HeyflowBlockConfig = {};
      if (configEl) {
        try {
          config = JSON.parse(configEl.getAttribute("data-config") ?? "{}") as HeyflowBlockConfig;
        } catch {
          // ignore parse errors
        }
      }

      switch (blockType) {
        case "rich-text": {
          // Use data-config.content if present, otherwise innerHTML of configEl or block
          const rawContent = config.content ?? configEl?.innerHTML ?? block.innerHTML ?? "";
          // Check if it contains a block-level heading as top-level element
          const hasTopLevelHeading = /^<h[12]/i.test(rawContent.trim());
          const kind = (isFirstRichText && hasTopLevelHeading) ? "title" : "text";
          isFirstRichText = false;
          subEls.push({
            id: newId("el"),
            kind,
            text: rawContent,
            isRichText: true,
            contentFormat: "html",
          });
          break;
        }

        case "multiple-choice": {
          const options = (config.options ?? []).map((opt): QuestionOption => {
            const optId = newId("opt");
            const result: QuestionOption = {
              id: optId,
              label: opt.label ?? "",
            };
            if (opt.emoji) result.emoji = opt.emoji;
            if (opt.image) result.imageUrl = opt.image;
            return result;
          });

          const hasImages = options.some((o) => !!o.imageUrl);
          const layout: "list" | "image_cards" = hasImages ? "image_cards" : "list";
          const kindOf: "single" | "multi" = config.multiselect ? "multi" : "single";

          const elId = newId("el");

          // Collect per-option conditional destinations from inputs
          const inputs = Array.from(block.querySelectorAll("input[data-destination]"));
          for (let oi = 0; oi < inputs.length && oi < options.length; oi++) {
            const dest = inputs[oi].getAttribute("data-destination") ?? "";
            if (dest && dest !== "next" && dest !== "") {
              // dest is either a screen name (screen-<hex>) or an element id (id-<hex>)
              // Normalise: if it starts with "id-" it might be an element id referencing a section id attr
              pendingCondEdges.push({
                fromStepId: stepId,
                destScreenName: dest,
                questionElId: elId,
                optionId: options[oi].id,
              });
            }
          }

          subEls.push({
            id: elId,
            kind: "question",
            kindOf,
            layout,
            options,
          });
          break;
        }

        case "image": {
          const url = config.url ?? config.imageUrl ?? config.src ?? "";
          const alt = config.alt ?? "";
          if (url) {
            subEls.push({ id: newId("el"), kind: "image", url, alt });
          }
          break;
        }

        case "loader": {
          const loadingText = config.text ?? "Loading...";
          const seconds = config.seconds ?? config.duration ?? 3;
          subEls.push({
            id: newId("el"),
            kind: "loading",
            text: loadingText,
            style: "dots",
            seconds,
          });
          break;
        }

        case "photo-carousel": {
          // Step 1: Try to read image list from data-config JSON (three known key names)
          const configImages =
            config.images ??
            config.slides ??
            config.items ??
            [];

          const seen = new Set<string>();
          const addImageSubEl = (url: string, alt: string) => {
            if (!url || seen.has(url)) return;
            seen.add(url);
            subEls.push({ id: newId("el"), kind: "image", url, alt });
          };

          if (configImages.length > 0) {
            for (const item of configImages) {
              addImageSubEl(item.url ?? item.src ?? "", item.alt ?? "");
            }
          }

          // Step 2: If config yielded nothing, scrape <img> tags from the block DOM
          if (seen.size === 0) {
            const imgs = Array.from(block.querySelectorAll("img"));
            for (const img of imgs) {
              const src = img.getAttribute("src") ?? "";
              const alt = img.getAttribute("alt") ?? "";
              addImageSubEl(src, alt);
            }
          }

          // Step 3: If still nothing, skip (never emit as custom_html)
          if (seen.size === 0) {
            warnings.push("Photo carousel imported but contained no images - block skipped");
          }

          break;
        }

        case "html": {
          const rawHtml = configEl?.innerHTML ?? block.innerHTML ?? "";
          subEls.push({ id: newId("el"), kind: "custom_html", html: rawHtml });
          break;
        }

        case "generic-button":
        case "progress-bar":
          // Skip — navigation is implicit, progress bar is handled by QuizSettings
          break;

        case "date-picker": {
          subEls.push({
            id: newId("el"),
            kind: "custom_html",
            html: block.outerHTML,
          });
          warnings.push(
            "Date picker imported as custom_html; user should re-add as a native control"
          );
          break;
        }

        default: {
          if (blockType) {
            subEls.push({ id: newId("el"), kind: "custom_html", html: block.outerHTML });
            warnings.push(`Unknown block type "${blockType}" imported as custom_html`);
          }
          break;
        }
      }
    }

    stepNodes.push({
      id: stepId,
      kind: "step",
      name: stepName,
      size: { width: 280, height: 360 },
      position: { x: 300 + i * 320, y: 200 },
      rotation: 0,
      subEls,
    });
  }

  // Build node graph
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
      position: { x: 300 + stepNodes.length * 320, y: 200 },
      redirectUrl: "",
    },
  };
  for (const step of stepNodes) {
    nodes[step.id] = step;
  }

  const edges: Record<string, QuizEdge> = {};

  // start -> first screen
  if (stepNodes.length > 0) {
    const e0 = newId("edge");
    edges[e0] = { id: e0, from: startId, to: stepNodes[0].id, condition: { kind: "default" } };
  }

  // linear chain
  for (let i = 0; i < stepNodes.length - 1; i++) {
    const eid = newId("edge");
    edges[eid] = {
      id: eid,
      from: stepNodes[i].id,
      to: stepNodes[i + 1].id,
      condition: { kind: "default" },
    };
  }

  // last step -> exit
  if (stepNodes.length > 0) {
    const eLast = newId("edge");
    edges[eLast] = {
      id: eLast,
      from: stepNodes[stepNodes.length - 1].id,
      to: exitId,
      condition: { kind: "default" },
    };
  }

  // Resolve conditional edges from multiple-choice options
  // Build a lookup: screen name -> stepId, and also by section id attributes
  const sectionIdToStepId = new Map<string, string>();
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const screenName = section.getAttribute("name") ?? "";
    const sectionId = section.getAttribute("id") ?? "";
    const stepId = screenStepIds[i];
    if (screenName) sectionIdToStepId.set(screenName, stepId);
    if (sectionId) sectionIdToStepId.set(sectionId, stepId);
  }

  for (const pending of pendingCondEdges) {
    const targetStepId = sectionIdToStepId.get(pending.destScreenName);
    if (!targetStepId) {
      warnings.push(
        `Option destination "${pending.destScreenName}" does not resolve to a known screen — conditional edge skipped`
      );
      continue;
    }
    const eid = newId("edge");
    edges[eid] = {
      id: eid,
      from: pending.fromStepId,
      to: targetStepId,
      condition: {
        kind: "option",
        questionElId: pending.questionElId,
        optionId: pending.optionId,
      },
    };
  }

  const quizData: QuizData = {
    id: `quiz_${Date.now().toString(36)}`,
    nodes,
    edges,
    camera: { x: 0, y: 0, z: 1 },
  };

  // Build settings
  const defaults = buildDefaultSettings();
  const settings: QuizSettings = {
    ...defaults,
    fontSettings: { enabled: fontFamily !== "Inter", fontFamily },
    progressBar: true,
    metadata: {
      title: pageTitle,
      description: defaults.metadata.description,
      ...(ogImage ? { ogImage } : {}),
    },
  };

  return { data: quizData, settings, title: pageTitle, warnings };
}

// ---------------------------------------------------------------------------
// importHeyflowQuiz — fast-path: fetch HTML and parse Heyflow structure
// ---------------------------------------------------------------------------

export async function importHeyflowQuiz(
  url: string,
  workspaceId: string,
  market: "se" | "dk" | "no",
  name?: string
): Promise<ImportResult | null> {
  const warnings: string[] = [];

  // Step 1: plain fetch
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // Step 2: detect Heyflow
  if (!isHeyflowHtml(html)) return null;

  // Step 3: parse
  let parseResult: ReturnType<typeof parseHeyflowHtml>;
  try {
    parseResult = parseHeyflowHtml(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Heyflow parse failed: ${msg}`);
    return null; // fall through to generic
  }

  let { data: quizData, settings } = parseResult;
  warnings.push(...parseResult.warnings);

  const stepCount = Object.values(quizData.nodes).filter((n) => n.kind === "step").length;
  if (stepCount === 0) return null;

  // Step 4: re-host images
  const quizId = quizData.id;
  quizData = await rehostImages(quizData, quizId, warnings);

  // Step 5: derive name
  const quizName = name ?? parseResult.title ?? "Imported Quiz";
  settings = { ...settings, metadata: { ...settings.metadata, title: quizName } };

  // Step 6: save to DB
  const savedId = await saveQuizToDb(quizData, settings, {
    workspaceId,
    market,
    name: quizName,
  });

  return {
    quizId: savedId,
    method: "heyflow",
    importedSteps: stepCount,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// importGenericQuiz — fallback: puppeteer walk of the quiz page
// ---------------------------------------------------------------------------

export async function importGenericQuiz(
  url: string,
  workspaceId: string,
  market: "se" | "dk" | "no",
  name?: string
): Promise<ImportResult> {
  const warnings: string[] = [];
  const steps: StepNode[] = [];
  const MAX_STEPS = 30;

  // Dynamic import to avoid pulling puppeteer into edge/test builds
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const puppeteer = require("puppeteer-core") as typeof import("puppeteer-core");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const chromium = require("@sparticuz/chromium") as { args: string[]; executablePath: () => Promise<string> };

  const isLocal = process.env.NODE_ENV === "development";
  const browser = await puppeteer.launch({
    args: isLocal ? ["--no-sandbox"] : chromium.args,
    executablePath: isLocal
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : await chromium.executablePath(),
    headless: true,
  });

  let pageTitle = "Imported Quiz";

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1500));

    pageTitle = await page.title().catch(() => "Imported Quiz");

    for (let stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
      // Snapshot current step
      const snapshot = await page.evaluate(() => {
        const heading =
          document.querySelector("h1")?.innerText ||
          document.querySelector("h2")?.innerText ||
          "";

        const paragraphs = Array.from(
          document.querySelectorAll("p, [class*='description'], [class*='subtitle']")
        )
          .map((el) => (el as HTMLElement).innerText?.trim())
          .filter((t) => t && t.length > 5)
          .slice(0, 3);

        // Look for option buttons — button groups with 2+ items
        const allButtons = Array.from(document.querySelectorAll("button, [role='button'], [class*='option'], [class*='answer']"));
        const optionButtons = allButtons
          .map((btn) => (btn as HTMLElement).innerText?.trim())
          .filter((t) => t && t.length > 0 && t.length < 200)
          .slice(0, 20);

        const images = Array.from(document.querySelectorAll("img"))
          .map((img) => ({ src: img.src, alt: img.alt }))
          .filter((i) => i.src && !i.src.startsWith("data:"))
          .slice(0, 3);

        // Check if there's a "continue" or "next" button outside options
        const continueBtn = document.querySelector(
          "button[class*='continue'], button[class*='next'], button[class*='submit'], [data-action='next']"
        );

        return { heading, paragraphs, optionButtons, images, hasContinue: !!continueBtn };
      });

      // Build step name from heading (first 3 words) or step number
      const headingWords = snapshot.heading.trim().split(/\s+/).slice(0, 3).join(" ");
      const stepName = headingWords || `Step ${stepIndex + 1}`;

      // Build subEls
      const subEls: SubEl[] = [];

      if (snapshot.heading) {
        subEls.push({
          id: newId("el"),
          kind: "title",
          text: snapshot.heading,
          isRichText: true,
          contentFormat: "html",
        });
      }

      for (const para of snapshot.paragraphs) {
        subEls.push({
          id: newId("el"),
          kind: "text",
          text: para,
          isRichText: true,
          contentFormat: "html",
        });
      }

      if (snapshot.optionButtons.length >= 2) {
        const options: QuestionOption[] = snapshot.optionButtons.map((label) => ({
          id: newId("opt"),
          label,
        }));
        subEls.push({
          id: newId("el"),
          kind: "question",
          kindOf: "single",
          layout: "list",
          options,
        });
      }

      for (const img of snapshot.images) {
        subEls.push({
          id: newId("el"),
          kind: "image",
          url: img.src,
          alt: img.alt,
        });
      }

      const stepId = newId("step");
      steps.push({
        id: stepId,
        kind: "step",
        name: stepName,
        size: { width: 280, height: 360 },
        position: { x: 300 + stepIndex * 340, y: 100 },
        rotation: 0,
        subEls,
      });

      // Try to advance to the next step
      const advanced = await page
        .evaluate(() => {
          // 1. Click first option-looking button
          const optBtn = document.querySelector(
            "[class*='option'], [class*='answer'], [data-quiz-opt]"
          ) as HTMLElement | null;
          if (optBtn) { optBtn.click(); return "option"; }

          // 2. Click continue/next
          const cont = document.querySelector(
            "button[class*='continue'], button[class*='next'], button[class*='submit']"
          ) as HTMLElement | null;
          if (cont) { cont.click(); return "continue"; }

          // 3. Click any button that isn't clearly a back/skip
          const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => {
              const t = b.innerText.toLowerCase();
              return !t.includes("back") && !t.includes("skip") && !t.includes("close");
            }
          ) as HTMLElement | null;
          if (btn) { btn.click(); return "button"; }

          return null;
        })
        .catch(() => null);

      if (!advanced) {
        // No advance possible — treat as last step
        break;
      }

      // Wait for transition
      await new Promise((r) => setTimeout(r, 1000));

      // Check if page URL changed (exit)
      const newUrl = page.url();
      if (newUrl !== url && !newUrl.includes(new URL(url).hostname)) {
        break;
      }
    }
  } finally {
    await browser.close();
  }

  if (steps.length === 0) {
    throw new Error("Generic scraper found no steps");
  }

  // Build linear QuizData
  const startId = newId("start");
  const exitId = newId("exit");

  const nodes: Record<string, QuizNode> = {
    [startId]: { id: startId, kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 200 } },
    [exitId]: { id: exitId, kind: "exit", name: "Exit", size: { width: 180, height: 80 }, position: { x: 300 + steps.length * 340, y: 200 }, redirectUrl: "" },
  };
  for (const s of steps) nodes[s.id] = s;

  const edges: Record<string, QuizEdge> = {};
  // start → first step
  const e0 = newId("edge");
  edges[e0] = { id: e0, from: startId, to: steps[0].id, condition: { kind: "default" } };
  // step[i] → step[i+1]
  for (let i = 0; i < steps.length - 1; i++) {
    const eid = newId("edge");
    edges[eid] = { id: eid, from: steps[i].id, to: steps[i + 1].id, condition: { kind: "default" } };
  }
  // last step → exit
  const eLast = newId("edge");
  edges[eLast] = { id: eLast, from: steps[steps.length - 1].id, to: exitId, condition: { kind: "default" } };

  const quizData: QuizData = {
    id: `quiz_${Date.now().toString(36)}`,
    nodes,
    edges,
    camera: { x: 0, y: 0, z: 1 },
  };

  // Re-host images
  const quizId = quizData.id;
  const finalQuizData = await rehostImages(quizData, quizId, warnings);

  warnings.push(
    "Imported via generic scraper. Branching logic is linear — review and add conditional routing as needed."
  );

  const settings = buildDefaultSettings();
  settings.metadata.title = name ?? pageTitle;

  const savedId = await saveQuizToDb(finalQuizData, settings, {
    workspaceId,
    market,
    name: name ?? pageTitle,
  });

  return {
    quizId: savedId,
    method: "generic",
    importedSteps: steps.length,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// swipeQuiz — top-level entry point: try clarflow first, fall back to generic
// ---------------------------------------------------------------------------

export async function swipeQuiz(
  url: string,
  workspaceId: string,
  market: "se" | "dk" | "no",
  name?: string
): Promise<ImportResult> {
  // 1. Clarflow fast-path (no browser needed)
  const clarflowResult = await importClarflowQuiz(url, workspaceId, market, name);
  if (clarflowResult) return clarflowResult;

  // 2. Heyflow fast-path (no browser needed)
  const heyflowResult = await importHeyflowQuiz(url, workspaceId, market, name);
  if (heyflowResult) return heyflowResult;

  // 3. Generic fallback (puppeteer)
  return importGenericQuiz(url, workspaceId, market, name);
}
