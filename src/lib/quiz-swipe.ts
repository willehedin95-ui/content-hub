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
  method: "clarflow" | "heyflow" | "nextjs" | "generic" | "llm";
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
// pruneEmptySteps — remove step nodes with no subEls (and no variantGroupId)
// Pure function: returns updated { data, warnings }.
// For each empty step, incoming edges are re-wired directly to outgoing
// targets, preserving conditions from the incoming edge.
// ---------------------------------------------------------------------------

export function pruneEmptySteps(
  data: QuizData,
  warnings: string[]
): { data: QuizData; warnings: string[] } {
  const edges = Object.values(data.edges);

  // Find empty, non-variant step nodes
  const emptyStepIds = new Set(
    Object.values(data.nodes)
      .filter(
        (n): n is StepNode =>
          n.kind === "step" &&
          n.subEls.length === 0 &&
          !n.variantGroupId,
      )
      .map((n) => n.id),
  );

  if (emptyStepIds.size === 0) {
    return { data, warnings };
  }

  const newNodes: Record<string, QuizNode> = { ...data.nodes };
  const newEdges: Record<string, QuizEdge> = { ...data.edges };

  // Existing edge set for duplicate detection: "from:to" strings
  const existingPairs = new Set(edges.map((e) => `${e.from}:${e.to}`));

  for (const emptyId of emptyStepIds) {
    const incomingEdges = Object.values(newEdges).filter(
      (e) => e.to === emptyId,
    );
    const outgoingEdges = Object.values(newEdges).filter(
      (e) => e.from === emptyId,
    );

    // For each (incoming, outgoing) pair, create a bridge edge
    for (const incoming of incomingEdges) {
      for (const outgoing of outgoingEdges) {
        const pairKey = `${incoming.from}:${outgoing.to}`;
        if (!existingPairs.has(pairKey)) {
          const bridgeId = newId("edge");
          newEdges[bridgeId] = {
            id: bridgeId,
            from: incoming.from,
            to: outgoing.to,
            // Preserve condition from the incoming edge
            condition: incoming.condition ?? { kind: "default" },
          };
          existingPairs.add(pairKey);
        }
      }
    }

    // Delete the empty step and all its edges
    delete newNodes[emptyId];
    for (const e of [...incomingEdges, ...outgoingEdges]) {
      delete newEdges[e.id];
      existingPairs.delete(`${e.from}:${e.to}`);
    }
  }

  const updatedWarnings = [
    ...warnings,
    `Removed ${emptyStepIds.size} empty screen${emptyStepIds.size === 1 ? "" : "s"} that had no content`,
  ];

  return {
    data: { ...data, nodes: newNodes, edges: newEdges },
    warnings: updatedWarnings,
  };
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
// rehostImages — download external images and upload to Supabase storage.
// Also rehost images referenced in question option imageUrls (Part B fix).
// A shared URL->remote URL map deduplicates: same source URL uploaded once.
// ---------------------------------------------------------------------------

async function rehostImages(
  quizData: QuizData,
  quizId: string,
  warnings: string[]
): Promise<QuizData> {
  const db = createServerSupabase();
  const nodes = { ...quizData.nodes };

  // Shared dedup map: original URL -> Supabase public URL
  const urlCache = new Map<string, string>();

  /**
   * Download `srcUrl` and upload to Supabase storage under `quizId`.
   * Returns the public URL, or `null` on failure (warning is pushed).
   * Deduplicates via `urlCache`.
   */
  async function rehostOne(srcUrl: string): Promise<string | null> {
    if (urlCache.has(srcUrl)) return urlCache.get(srcUrl)!;

    try {
      const imageRes = await fetch(srcUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!imageRes.ok) {
        warnings.push(`Image re-host failed (${imageRes.status}): ${srcUrl}`);
        return null;
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
        warnings.push(`Image upload failed for ${srcUrl}: ${error.message}`);
        return null;
      }

      const { data: urlData } = db.storage.from("translated-images").getPublicUrl(path);
      urlCache.set(srcUrl, urlData.publicUrl);
      return urlData.publicUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Image re-host error for ${srcUrl}: ${msg}`);
      return null;
    }
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.kind !== "step") continue;

    const updatedSubEls = await Promise.all(
      node.subEls.map(async (el): Promise<SubEl> => {
        // Rehost standalone image subEls
        if (el.kind === "image") {
          if (!el.url || el.url.startsWith("data:")) return el;
          const remote = await rehostOne(el.url);
          return remote ? { ...el, url: remote } : el;
        }

        // Rehost question option imageUrls (Part B)
        if (el.kind === "question") {
          const updatedOptions = await Promise.all(
            el.options.map(async (opt): Promise<QuestionOption> => {
              if (!opt.imageUrl || opt.imageUrl.startsWith("data:")) return opt;
              const remote = await rehostOne(opt.imageUrl);
              return remote ? { ...opt, imageUrl: remote } : opt;
            })
          );
          return { ...el, options: updatedOptions };
        }

        return el;
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
// dedupeStepImages — remove standalone image subEls that duplicate images
// already shown as option card thumbnails, and remove duplicate standalone
// images (same URL → keep only first occurrence).
//
// Algorithm:
//   1. Collect all imageUrls referenced in question.options[].imageUrl.
//   2. Walk the subEls list; for each image subEl:
//      a. If its url matches any option imageUrl → drop it.
//      b. If its url was already seen in a prior standalone image → drop it.
//   3. Non-image subEls are always kept.
//
// Exported for unit testing.
// ---------------------------------------------------------------------------

export function dedupeStepImages(subEls: SubEl[]): SubEl[] {
  // Step 1: collect all URLs used by question option cards
  const optionImageUrls = new Set<string>();
  for (const el of subEls) {
    if (el.kind === "question") {
      for (const opt of el.options) {
        if (opt.imageUrl) optionImageUrls.add(opt.imageUrl);
      }
    }
  }

  // Step 2: filter out duplicate standalone images
  const seenStandaloneUrls = new Set<string>();
  return subEls.filter((el) => {
    if (el.kind !== "image") return true;
    if (optionImageUrls.has(el.url)) return false;
    if (seenStandaloneUrls.has(el.url)) return false;
    seenStandaloneUrls.add(el.url);
    return true;
  });
}

// ---------------------------------------------------------------------------
// splitRichTextHtml — split a rich-text HTML block into ordered SubEls,
// extracting <img> tags as image subEls and grouping surrounding text.
// Exported for unit testing.
// ---------------------------------------------------------------------------

export function splitRichTextHtml(html: string, baseId: string): SubEl[] {
  // Dynamic require so jsdom is not bundled in the Edge runtime / client builds
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require("jsdom") as typeof import("jsdom");

  const dom = new JSDOM(`<div id="root">${html}</div>`);
  const root = dom.window.document.getElementById("root")!;
  const childNodes = Array.from(root.childNodes);

  const result: SubEl[] = [];
  let chunkNodes: globalThis.Node[] = [];
  let chunkIndex = 0;

  const flushChunk = () => {
    if (chunkNodes.length === 0) return;

    // Serialize chunk nodes back to HTML
    const div = dom.window.document.createElement("div");
    for (const n of chunkNodes) {
      div.appendChild(n.cloneNode(true));
    }
    const chunkHtml = div.innerHTML.trim();
    if (!chunkHtml) {
      chunkNodes = [];
      return;
    }

    // Determine kind: title if it starts with h1/h2 (block-level heading)
    const firstEl = chunkNodes.find(
      (n): n is globalThis.Element =>
        n.nodeType === 1 // ELEMENT_NODE
    ) as globalThis.Element | undefined;
    const tag = firstEl?.tagName?.toLowerCase() ?? "";
    const kind: "title" | "text" = tag === "h1" || tag === "h2" ? "title" : "text";

    result.push({
      id: `${baseId}_chunk${chunkIndex++}`,
      kind,
      text: chunkHtml,
      isRichText: true,
      contentFormat: "html",
    });
    chunkNodes = [];
  };

  for (const node of childNodes) {
    if (node.nodeType === 1) {
      // Element node
      const el = node as globalThis.Element;
      if (el.tagName.toLowerCase() === "img") {
        // Flush pending chunk first
        flushChunk();
        // Emit an image subEl
        const src = el.getAttribute("src") ?? "";
        const alt = el.getAttribute("alt") ?? "";
        if (src) {
          result.push({
            id: `${baseId}_img${chunkIndex++}`,
            kind: "image",
            url: src,
            alt,
          });
        }
      } else {
        chunkNodes.push(node);
      }
    } else if (node.nodeType === 3) {
      // Text node — include only if non-whitespace
      const text = node.textContent ?? "";
      if (text.trim()) {
        chunkNodes.push(node);
      }
    } else {
      chunkNodes.push(node);
    }
  }

  // Flush any remaining chunk
  flushChunk();

  return result;
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
// extractHeyflowFlowId — parse the flowId from a Heyflow HTML page.
// Heyflow embeds the flowId in asset URLs like:
//   https://assets.prd.heyflow.com/flows/{flowId}/www/...
// Returns null if not found.
// Exported for testing.
// ---------------------------------------------------------------------------

export function extractHeyflowFlowId(html: string): string | null {
  // Match any assets.prd.heyflow.com/flows/{flowId}/... URL
  const match = html.match(/assets\.prd\.heyflow\.com\/flows\/([a-zA-Z0-9_-]+)\//);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// resolveHeyflowOptionImageUrl — resolve a possibly-relative option image URL
// to an absolute URL using the Heyflow asset base.
// If the URL is already absolute, returns it unchanged.
// Exported for testing.
// ---------------------------------------------------------------------------

export function resolveHeyflowOptionImageUrl(
  rawUrl: string,
  flowId: string | null
): string {
  if (!rawUrl) return rawUrl;
  // Already absolute
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
  // Relative — needs base. If we don't have a flowId we can't resolve, return as-is.
  if (!flowId) return rawUrl;
  // Strip any leading slash to avoid double-slash
  const rel = rawUrl.startsWith("/") ? rawUrl.slice(1) : rawUrl;
  return `https://assets.prd.heyflow.com/flows/${flowId}/www/assets/${rel}`;
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

  // Extract the Heyflow flowId from the raw HTML (Part A)
  const flowId = extractHeyflowFlowId(html);

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
          // Split on embedded <img> tags — extract as image subEls, keep text as title/text chunks
          const splitEls = splitRichTextHtml(rawContent, newId("el"));
          if (splitEls.length === 0) {
            // Nothing to emit — skip
          } else if (splitEls.length === 1 && splitEls[0].kind !== "image") {
            // Single text chunk — apply isFirstRichText heading check for title/text kind
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
          } else {
            // Multiple chunks and/or images — emit in order
            // First text chunk that is a "title" kind: only emit as title if it's first rich-text seen overall
            let firstEl = true;
            for (const el of splitEls) {
              if (el.kind === "image") {
                subEls.push(el);
              } else {
                const hasHeading = /^<h[12]/i.test((el.kind === "title" || el.kind === "text" ? el.text : "").trim());
                const kind = (firstEl && isFirstRichText && hasHeading) ? "title" : "text";
                subEls.push({
                  id: newId("el"),
                  kind,
                  text: el.kind === "title" || el.kind === "text" ? el.text : "",
                  isRichText: true,
                  contentFormat: "html",
                });
              }
              firstEl = false;
            }
            isFirstRichText = false;
          }
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
            // Part A fix: resolve relative option image URLs to absolute using the flowId
            if (opt.image) result.imageUrl = resolveHeyflowOptionImageUrl(opt.image, flowId);
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
          // Heuristic: skip decorative snippets (< 10 chars of text AND no images)
          const textContent = rawHtml.replace(/<[^>]+>/g, "").trim();
          const hasImages = /<img\s/i.test(rawHtml);
          if (textContent.length < 10 && !hasImages) {
            // Decorative/spacer block — skip entirely
            break;
          }
          // Split on embedded <img> tags — same logic as rich-text
          const splitEls = splitRichTextHtml(rawHtml, newId("el"));
          const hasAnyImage = splitEls.some((e) => e.kind === "image");
          if (!hasAnyImage) {
            // No images found — emit as single custom_html (original behavior)
            subEls.push({ id: newId("el"), kind: "custom_html", html: rawHtml });
          } else {
            // Has images — split and extract
            for (const el of splitEls) {
              if (el.kind === "image") {
                subEls.push(el);
              } else {
                const text = el.kind === "title" || el.kind === "text" ? el.text : "";
                if (text.trim()) {
                  subEls.push({ id: newId("el"), kind: "custom_html", html: text });
                }
              }
            }
          }
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

    // Section-level image safety net:
    // Find all <img> tags in the section that are not already referenced
    // in an emitted image subEl. Emit any missed images at the end of the step.
    {
      const emittedUrls = new Set<string>(
        subEls
          .filter((e): e is Extract<SubEl, { kind: "image" }> => e.kind === "image")
          .map((e) => e.url)
      );
      const allImgs = Array.from(section.querySelectorAll("img"));
      for (const img of allImgs) {
        const src = img.getAttribute("src") ?? "";
        if (src && !emittedUrls.has(src)) {
          emittedUrls.add(src);
          subEls.push({
            id: newId("el"),
            kind: "image",
            url: src,
            alt: img.getAttribute("alt") ?? "",
          });
        }
      }
    }

    // Dedupe standalone image subEls that duplicate question option thumbnails
    // or that repeat the same URL more than once.
    const dedupedSubEls = dedupeStepImages(subEls);

    stepNodes.push({
      id: stepId,
      kind: "step",
      name: stepName,
      size: { width: 280, height: 360 },
      position: { x: 300 + i * 320, y: 200 },
      rotation: 0,
      subEls: dedupedSubEls,
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

  let quizData: QuizData = {
    id: `quiz_${Date.now().toString(36)}`,
    nodes,
    edges,
    camera: { x: 0, y: 0, z: 1 },
  };

  // Prune screens that only contained skipped blocks (generic-button, progress-bar)
  const pruned = pruneEmptySteps(quizData, warnings);
  quizData = pruned.data;
  warnings.splice(0, warnings.length, ...pruned.warnings);

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
// importNextJsQuiz — fast-path for Next.js quiz funnels that put each step on
// its own URL and embed pageProps in <script id="__NEXT_DATA__">. Walks the
// chain by reading pageProps.funnelQuizPath / pageProps.nextStep / first
// internal anchor on the current screen, one page at a time. No browser
// required — jsdom is enough because Next.js serves the step content in the
// initial HTML.
// ---------------------------------------------------------------------------

type NextStepExtract = {
  url: string;
  heading: string;
  paragraphs: string[];
  options: { label: string; href?: string; imageUrl?: string }[];
  images: string[];
};

function extractNextDataFromHtml(html: string): Record<string, unknown> | null {
  const match = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickNextUrl(
  nextData: Record<string, unknown>,
  dom: import("jsdom").JSDOM,
  baseUrl: string,
): string | null {
  const props = ((nextData.props as Record<string, unknown> | undefined)
    ?.pageProps as Record<string, unknown> | undefined) ?? {};

  // Pattern A: explicit funnel next-step field
  const candidates = [
    "funnelQuizPath",
    "nextStepPath",
    "nextStep",
    "nextUrl",
    "nextPath",
  ];
  for (const k of candidates) {
    const v = props[k];
    if (typeof v === "string" && v.length > 0) {
      try {
        return new URL(v, baseUrl).href;
      } catch {
        /* ignore malformed */
      }
    }
  }

  // Pattern B: first internal anchor on an option-looking element. Pick the
  // first <a href> that points to the same origin and a different path than
  // the current one.
  const currentOrigin = new URL(baseUrl).origin;
  const currentPath = new URL(baseUrl).pathname;
  const anchors = Array.from(dom.window.document.querySelectorAll("a[href]"));
  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) continue;
    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (abs.origin !== currentOrigin) continue;
    if (abs.pathname === currentPath) continue;
    if (abs.pathname.includes("/terms") || abs.pathname.includes("/privacy")) continue;
    return abs.href;
  }
  return null;
}

function extractStepFromNextPage(
  html: string,
  nextData: Record<string, unknown>,
  currentUrl: string,
): NextStepExtract | null {
  const { JSDOM } = require("jsdom") as typeof import("jsdom");
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const heading =
    (doc.querySelector("h1") as HTMLElement | null)?.textContent?.trim() ||
    (doc.querySelector("h2") as HTMLElement | null)?.textContent?.trim() ||
    "";

  const paragraphs = Array.from(doc.querySelectorAll("p"))
    .map((p) => p.textContent?.trim() ?? "")
    .filter((t) => t.length > 5 && t.length < 400)
    .slice(0, 3);

  // Options: look for anchor-wrapped clickables or option-like classes.
  const optionElements = Array.from(
    doc.querySelectorAll(
      "a[href], button, [role='button'], [class*='option'], [class*='answer'], [class*='choice']"
    )
  );
  const seen = new Set<string>();
  const options: NextStepExtract["options"] = [];
  for (const el of optionElements) {
    const text = el.textContent?.trim().replace(/\s+/g, " ") ?? "";
    if (!text || text.length > 150) continue;
    if (/^(back|skip|close|menu|help|logo|\<|\>)$/i.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    const href = el.tagName === "A"
      ? (el as HTMLAnchorElement).getAttribute("href") ?? undefined
      : el.closest("a")?.getAttribute("href") ?? undefined;
    const img = el.querySelector("img") as HTMLImageElement | null;
    const imgSrc = img?.getAttribute("src") ?? undefined;
    options.push({
      label: text,
      ...(href ? { href } : {}),
      ...(imgSrc ? { imageUrl: new URL(imgSrc, currentUrl).href } : {}),
    });
    if (options.length >= 12) break;
  }

  const images = Array.from(doc.querySelectorAll("img"))
    .map((img) => img.getAttribute("src") ?? "")
    .filter((s) => s && !s.startsWith("data:"))
    .slice(0, 3)
    .map((s) => {
      try {
        return new URL(s, currentUrl).href;
      } catch {
        return s;
      }
    });

  // Reduce noise: also read pageProps fields that commonly carry copy (title,
  // subtitle) if the DOM heading was empty
  const props = ((nextData.props as Record<string, unknown> | undefined)
    ?.pageProps as Record<string, unknown> | undefined) ?? {};
  const pageCopy = JSON.stringify(props).slice(0, 20);
  void pageCopy; // kept for debugging; not exposed

  if (!heading && options.length === 0 && paragraphs.length === 0) return null;

  return { url: currentUrl, heading, paragraphs, options, images };
}

export async function importNextJsQuiz(
  url: string,
  workspaceId: string,
  market: "se" | "dk" | "no",
  name?: string,
): Promise<ImportResult | null> {
  const warnings: string[] = [];
  const MAX_STEPS = 30;
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";

  // Fetch first page to detect Next.js
  const firstRes = await fetch(url, {
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!firstRes || !firstRes.ok) return null;
  const firstHtml = await firstRes.text();
  const firstData = extractNextDataFromHtml(firstHtml);
  if (!firstData) return null;

  // Ensure it actually has pageProps; Next.js error pages also embed __NEXT_DATA__.
  const props = ((firstData.props as Record<string, unknown> | undefined)
    ?.pageProps as Record<string, unknown> | undefined) ?? {};
  if (Object.keys(props).length === 0) return null;

  // Quick heuristic: content must not be obvious marketing homepage. If the
  // first page has no heading and no options, bail out.
  const { JSDOM } = require("jsdom") as typeof import("jsdom");
  const initialDom = new JSDOM(firstHtml);
  const firstStep = extractStepFromNextPage(firstHtml, firstData, url);
  if (!firstStep || (firstStep.options.length === 0 && !firstStep.heading)) {
    return null;
  }

  const pageTitle =
    (initialDom.window.document.title || "").trim() || "Imported Quiz";

  // Walk the chain
  const steps: NextStepExtract[] = [firstStep];
  let currentUrl: string | null = pickNextUrl(firstData, initialDom, url);
  const visited = new Set<string>([url]);

  while (currentUrl && !visited.has(currentUrl) && steps.length < MAX_STEPS) {
    visited.add(currentUrl);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      break;
    }
    if (!res.ok) break;
    const html = await res.text();
    const data = extractNextDataFromHtml(html);
    if (!data) break;
    const stepExtract = extractStepFromNextPage(html, data, currentUrl);
    if (!stepExtract) break;
    steps.push(stepExtract);
    const dom = new JSDOM(html);
    currentUrl = pickNextUrl(data, dom, currentUrl);
  }

  if (steps.length < 2) {
    // Only one step found → don't commit to Next.js path; let click-through try.
    return null;
  }

  // Build QuizData
  const startId = newId("start");
  const exitId = newId("exit");
  const nodes: Record<string, QuizNode> = {
    [startId]: { id: startId, kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 200 } },
    [exitId]: { id: exitId, kind: "exit", name: "Exit", size: { width: 180, height: 80 }, position: { x: 300 + steps.length * 340, y: 200 }, redirectUrl: "" },
  };

  const stepNodes: StepNode[] = steps.map((se, i) => {
    const subEls: SubEl[] = [];
    if (se.heading) {
      subEls.push({
        id: newId("el"),
        kind: "title",
        text: se.heading,
        isRichText: true,
        contentFormat: "html",
      });
    }
    for (const p of se.paragraphs) {
      subEls.push({
        id: newId("el"),
        kind: "text",
        text: p,
        isRichText: true,
        contentFormat: "html",
      });
    }
    if (se.options.length >= 2) {
      const hasImages = se.options.filter((o) => o.imageUrl).length >= se.options.length / 2;
      subEls.push({
        id: newId("el"),
        kind: "question",
        kindOf: "single",
        layout: hasImages ? "image_cards" : "list",
        options: se.options.map((o) => ({
          id: newId("opt"),
          label: o.label,
          ...(o.imageUrl ? { imageUrl: o.imageUrl } : {}),
        })),
      });
    }
    for (const imgUrl of se.images) {
      subEls.push({ id: newId("el"), kind: "image", url: imgUrl, alt: "" });
    }
    const stepName = se.heading.trim().split(/\s+/).slice(0, 3).join(" ") || `Step ${i + 1}`;
    return {
      id: newId("step"),
      kind: "step",
      name: stepName,
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

  let quizData: QuizData = {
    id: `quiz_${Date.now().toString(36)}`,
    nodes,
    edges,
    camera: { x: 0, y: 0, z: 1 },
  };

  const quizName = name ?? pageTitle;
  const settings: QuizSettings = {
    ...buildDefaultSettings(),
    metadata: { ...buildDefaultSettings().metadata, title: quizName },
  };

  // Re-host images
  quizData = await rehostImages(quizData, quizData.id, warnings);

  warnings.push(
    `Imported via Next.js multi-page crawler (${steps.length} steps). Linear flow; add conditional routing as needed.`,
  );

  const savedId = await saveQuizToDb(quizData, settings, {
    workspaceId,
    market,
    name: quizName,
  });

  return {
    quizId: savedId,
    method: "nextjs",
    importedSteps: stepNodes.length,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// detectStepCarousel — heuristic: find a container whose N children share a
// class-prefix and where exactly 1 is currently visible. Returns an ordered
// list of per-step extracts without having to click through. Used by the
// generic importer as a fast-path before resorting to click-through.
// ---------------------------------------------------------------------------

export type CarouselStepExtract = {
  heading: string;
  paragraphs: string[];
  options: string[];
  optionImages: (string | null)[];
  images: string[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function detectStepCarousel(page: any): Promise<CarouselStepExtract[] | null> {
  try {
    const result = await page.evaluate(() => {
      const isVisible = (el: Element): boolean => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.offsetParent === null) return false;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (parseFloat(cs.opacity) < 0.1) return false;
        return true;
      };

      // Rank candidate parents: many kids, shared class, 1 visible child.
      let best: {
        parent: Element;
        kids: Element[];
        sharedCls: string;
        score: number;
      } | null = null;

      for (const el of document.querySelectorAll("*")) {
        const kids = Array.from(el.children);
        if (kids.length < 4 || kids.length > 80) continue;
        const classLists = kids.map(
          (k) => k.className?.toString().split(" ").filter(Boolean) || []
        );
        const firstCls = classLists[0]?.[0];
        if (!firstCls) continue;
        const withFirstCls = classLists.filter((cl) => cl.includes(firstCls)).length;
        if (withFirstCls / kids.length < 0.7) continue;
        const visible = kids.filter((k) => isVisible(k)).length;
        if (visible !== 1) continue;

        // Ignore container if it's clearly a cookie-consent / table / tiny text block.
        const parentCls = (el.className?.toString() || "").toLowerCase();
        if (/cookie|consent|modal|tooltip|menu|dropdown/.test(parentCls)) continue;

        const score = withFirstCls * 10 - kids.length;
        if (!best || score > best.score) {
          best = { parent: el, kids, sharedCls: firstCls, score };
        }
      }

      if (!best) return null;

      const extractStep = (step: Element): CarouselStepExtract => {
        const heading =
          (step.querySelector("h1, h2, h3, [class*='title'], [class*='heading']") as HTMLElement | null)?.innerText?.slice(0, 300).trim() || "";

        const paragraphs = Array.from(step.querySelectorAll("p, [class*='description'], [class*='subtitle']"))
          .map((el) => (el as HTMLElement).innerText?.trim())
          .filter((t) => t && t.length > 5 && t.length < 500)
          .slice(0, 3);

        // Options: find inner buttons/clickables scoped to THIS step. Dedupe.
        const optionCandidates = Array.from(
          step.querySelectorAll(
            "button, [role='button'], label, [class*='answer'], [class*='option'], [class*='choice']"
          )
        );
        const seen = new Set<string>();
        const options: string[] = [];
        const optionImages: (string | null)[] = [];
        for (const el of optionCandidates) {
          const text = (el as HTMLElement).innerText?.trim().replace(/\s+/g, " ");
          if (!text || text.length > 150) continue;
          if (seen.has(text)) continue;
          seen.add(text);
          options.push(text);
          const img = el.querySelector("img") as HTMLImageElement | null;
          optionImages.push(img?.src || null);
          if (options.length >= 30) break;
        }

        const images = Array.from(step.querySelectorAll("img"))
          .map((img) => (img as HTMLImageElement).src)
          .filter((s) => s && !s.startsWith("data:") && s.length < 500)
          .slice(0, 3);

        return { heading, paragraphs, options, optionImages, images };
      };

      return best.kids.map(extractStep);
    });

    return result;
  } catch {
    return null;
  }
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

    // Step-carousel detection: many custom SPAs render ALL screens into the
    // DOM and toggle visibility per step (PawChamp, Everskin, etc). If we can
    // find a container with N similar siblings where exactly one is visible,
    // extract every sibling as a step in one pass — much faster and more
    // reliable than clicking through.
    const carousel = await detectStepCarousel(page);
    if (carousel && carousel.length >= 3) {
      warnings.push(
        `Detected step-carousel pattern with ${carousel.length} screens. Extracted in one pass, no click-through needed.`
      );
      for (let i = 0; i < carousel.length; i++) {
        const sc = carousel[i];
        const subEls: SubEl[] = [];
        if (sc.heading) {
          subEls.push({
            id: newId("el"),
            kind: "title",
            text: sc.heading,
            isRichText: true,
            contentFormat: "html",
          });
        }
        for (const para of sc.paragraphs) {
          subEls.push({
            id: newId("el"),
            kind: "text",
            text: para,
            isRichText: true,
            contentFormat: "html",
          });
        }
        if (sc.options.length >= 2) {
          subEls.push({
            id: newId("el"),
            kind: "question",
            kindOf: "single",
            layout: sc.images.length >= sc.options.length ? "image_cards" : "list",
            options: sc.options.map((label, oi) => ({
              id: newId("opt"),
              label,
              ...(sc.optionImages[oi] ? { imageUrl: sc.optionImages[oi] } : {}),
            })),
          });
        }
        for (const src of sc.images) {
          subEls.push({ id: newId("el"), kind: "image", url: src, alt: "" });
        }
        if (subEls.length === 0) continue;
        const stepNameWords = sc.heading.trim().split(/\s+/).slice(0, 3).join(" ");
        const stepId = newId("step");
        steps.push({
          id: stepId,
          kind: "step",
          name: stepNameWords || `Step ${i + 1}`,
          size: { width: 280, height: 360 },
          position: { x: 300 + i * 340, y: 100 },
          rotation: 0,
          subEls,
        });
      }
    }

    const skipClickThrough = steps.length >= 3;

    for (let stepIndex = 0; stepIndex < MAX_STEPS && !skipClickThrough; stepIndex++) {
      // Snapshot current step.
      // Visibility filter: many SPAs keep all steps in DOM and toggle visibility.
      // Without this filter we grab buttons from hidden screens and merge them
      // into the current one (PawChamp bug).
      const snapshot = await page.evaluate(() => {
        const isVisible = (el: Element): boolean => {
          if (!(el instanceof HTMLElement)) return false;
          if (el.offsetParent === null) return false;
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") return false;
          if (parseFloat(cs.opacity) < 0.1) return false;
          return true;
        };

        const visibleHeadings = Array.from(
          document.querySelectorAll("h1, h2, h3")
        ).filter(isVisible);
        const heading = (visibleHeadings[0] as HTMLElement | undefined)?.innerText || "";

        const paragraphs = Array.from(
          document.querySelectorAll("p, [class*='description'], [class*='subtitle']")
        )
          .filter(isVisible)
          .map((el) => (el as HTMLElement).innerText?.trim())
          .filter((t) => t && t.length > 5)
          .slice(0, 3);

        // Scope options to a visible question/step container when possible.
        // Fall back to whole document but keep visibility filter.
        const allButtons = Array.from(
          document.querySelectorAll(
            "button, [role='button'], [class*='option'], [class*='answer']"
          )
        ).filter(isVisible);
        const optionButtons = allButtons
          .map((btn) => (btn as HTMLElement).innerText?.trim())
          .filter((t) => t && t.length > 0 && t.length < 200)
          .slice(0, 20);

        const images = Array.from(document.querySelectorAll("img"))
          .filter(isVisible)
          .map((img) => ({ src: (img as HTMLImageElement).src, alt: (img as HTMLImageElement).alt }))
          .filter((i) => i.src && !i.src.startsWith("data:"))
          .slice(0, 3);

        const continueBtn = Array.from(
          document.querySelectorAll(
            "button[class*='continue'], button[class*='next'], button[class*='submit'], [data-action='next']"
          )
        ).find(isVisible);

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

      // Try to advance to the next step. Only click visible elements — hidden
      // next buttons exist on other screens of the same carousel.
      const advanced = await page
        .evaluate(() => {
          const isVisible = (el: Element): boolean => {
            if (!(el instanceof HTMLElement)) return false;
            if (el.offsetParent === null) return false;
            const cs = getComputedStyle(el);
            if (cs.display === "none" || cs.visibility === "hidden") return false;
            if (parseFloat(cs.opacity) < 0.1) return false;
            return true;
          };

          // 1. First visible option-looking element
          const optBtn = Array.from(
            document.querySelectorAll("[class*='option'], [class*='answer'], [data-quiz-opt]")
          ).find(isVisible) as HTMLElement | undefined;
          if (optBtn) { optBtn.click(); return "option"; }

          // 2. First visible continue/next
          const cont = Array.from(
            document.querySelectorAll(
              "button[class*='continue'], button[class*='next'], button[class*='submit']"
            )
          ).find(isVisible) as HTMLElement | undefined;
          if (cont) { cont.click(); return "continue"; }

          // 3. Any visible button that isn't clearly back/skip
          const btn = Array.from(document.querySelectorAll("button"))
            .filter(isVisible)
            .find((b) => {
              const t = b.innerText.toLowerCase();
              return !t.includes("back") && !t.includes("skip") && !t.includes("close");
            }) as HTMLElement | undefined;
          if (btn) { btn.click(); return "button"; }

          return null;
        })
        .catch(() => null);

      if (!advanced) {
        // No advance possible — treat as last step
        break;
      }

      // Record URL/hash before waiting so we can detect client-side routing.
      // Also snapshot the current visible heading so we can detect in-place
      // DOM swaps (SPAs that don't touch URL).
      const preUrl = page.url();
      const preHeading = snapshot.heading;

      // Wait for transition
      await new Promise((r) => setTimeout(r, 1000));

      const postUrl = page.url();
      const postHeading = await page.evaluate(() => {
        const h = Array.from(document.querySelectorAll("h1, h2, h3")).find((el) => {
          if (!(el instanceof HTMLElement)) return false;
          if (el.offsetParent === null) return false;
          const cs = getComputedStyle(el);
          return cs.display !== "none" && cs.visibility !== "hidden";
        });
        return (h as HTMLElement | undefined)?.innerText ?? "";
      }).catch(() => "");

      // Exit if navigation left the origin
      if (postUrl !== preUrl) {
        try {
          if (new URL(postUrl).hostname !== new URL(url).hostname) break;
        } catch {
          break;
        }
      }

      // If neither URL/hash nor visible heading changed, our click did
      // nothing — probably we hit an interstitial-waiting-for-animation or
      // ran off the end of the quiz. Stop scraping to avoid infinite loops
      // of collecting the same step.
      if (postUrl === preUrl && postHeading === preHeading && postHeading.length > 0) {
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
// importLlmQuiz — last-resort fallback: ask Claude Sonnet to extract quiz
// structure from the rendered page HTML. Cheap-but-not-free (~$0.15 per
// import) so we only reach for it after every cheaper fast-path has passed.
// Expects ANTHROPIC_API_KEY; returns null when the key is missing or the
// model returns unparsable JSON.
// ---------------------------------------------------------------------------

const LLM_EXTRACTION_PROMPT = `You extract quiz funnel structure from HTML into a strict JSON schema.

Given an HTML document containing a lead-gen quiz / onboarding funnel, return a JSON object of shape:

{
  "title": string,                  // overall quiz name
  "steps": [                        // ordered steps the user sees
    {
      "title": string,              // the main question or heading
      "paragraphs": string[],       // supporting copy (optional)
      "questionType": "single" | "multi" | "text_input" | "range" | "info",
      "options": [                  // only for single/multi
        { "label": string, "imageUrl"?: string }
      ],
      "inputType"?: "text" | "number" | "date",  // only for text_input
      "rangeMin"?: number,          // only for range
      "rangeMax"?: number,
      "rangeUnit"?: string,
      "images"?: string[]           // standalone images on the step
    }
  ]
}

Rules:
- Only include steps the user actually fills in (skip intro landing pages with no input).
- Do NOT invent options that aren't in the HTML.
- Do NOT include cookie banners, privacy modals, footers, navigation.
- Strip all inline HTML tags from text; plain text only.
- If a step has dropdown with many options, include all of them.
- Trim whitespace, collapse inner spaces.
- Return ONLY valid JSON. No prose, no code fences.`;

export async function importLlmQuiz(
  url: string,
  workspaceId: string,
  market: "se" | "dk" | "no",
  name?: string,
): Promise<ImportResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Fetch initial HTML (jsdom for cleanup). No browser walk here — the
  // fast-path tier above already handles SPA content; LLM runs on what
  // the server returns statically. If the page is purely client-rendered,
  // this won't help, but neither would most fetch-based importers.
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
  const res = await fetch(url, {
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const rawHtml = await res.text();

  // Trim HTML to reduce tokens: drop <script>, <style>, SVG definitions.
  const { JSDOM } = require("jsdom") as typeof import("jsdom");
  const dom = new JSDOM(rawHtml);
  const doc = dom.window.document;
  for (const sel of ["script", "style", "svg", "link[rel='preload']", "noscript"]) {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  }
  const trimmed = doc.documentElement.outerHTML;
  if (trimmed.length > 250_000) {
    // too big — LLM would timeout or cost too much
    return null;
  }
  const pageTitle = doc.title.trim() || "Imported Quiz";

  // Call Claude
  const Anthropic = (require("@anthropic-ai/sdk") as { default: typeof import("@anthropic-ai/sdk").default })
    .default;
  const client = new Anthropic({ apiKey });
  let jsonText: string;
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system: LLM_EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: `URL: ${url}\n\nHTML:\n${trimmed}`,
        },
      ],
    });
    const textBlock = msg.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    jsonText = textBlock.text.trim();
    // Strip leading ```json if present
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  } catch (err) {
    console.error("[quiz-swipe/llm] Claude call failed:", err);
    return null;
  }

  type LlmStep = {
    title?: string;
    paragraphs?: string[];
    questionType?: "single" | "multi" | "text_input" | "range" | "info";
    options?: { label: string; imageUrl?: string }[];
    inputType?: "text" | "number" | "date";
    rangeMin?: number;
    rangeMax?: number;
    rangeUnit?: string;
    images?: string[];
  };
  type LlmOut = { title?: string; steps?: LlmStep[] };

  let parsed: LlmOut;
  try {
    parsed = JSON.parse(jsonText) as LlmOut;
  } catch {
    return null;
  }
  if (!parsed.steps || parsed.steps.length === 0) return null;

  // Build QuizData
  const warnings: string[] = [
    `Imported via LLM extractor. Review carefully — LLMs can hallucinate options. ${parsed.steps.length} steps extracted.`,
  ];
  const startId = newId("start");
  const exitId = newId("exit");
  const nodes: Record<string, QuizNode> = {
    [startId]: { id: startId, kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 200 } },
    [exitId]: { id: exitId, kind: "exit", name: "Exit", size: { width: 180, height: 80 }, position: { x: 300 + parsed.steps.length * 340, y: 200 }, redirectUrl: "" },
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
      subEls.push({ id: newId("el"), kind: "text", text: p, isRichText: true, contentFormat: "html" });
    }
    if (s.questionType === "single" || s.questionType === "multi") {
      const opts = (s.options ?? []).filter((o) => o.label && o.label.length < 200);
      if (opts.length >= 2) {
        const hasImg = opts.filter((o) => o.imageUrl).length >= opts.length / 2;
        subEls.push({
          id: newId("el"),
          kind: "question",
          kindOf: s.questionType,
          layout: opts.length >= 8 ? "dropdown" : hasImg ? "image_cards" : "list",
          options: opts.map((o) => ({
            id: newId("opt"),
            label: o.label,
            ...(o.imageUrl ? { imageUrl: o.imageUrl } : {}),
          })),
          ...(opts.length >= 8 ? { searchable: true } : {}),
        });
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
    for (const img of s.images ?? []) {
      try {
        subEls.push({ id: newId("el"), kind: "image", url: new URL(img, url).href, alt: "" });
      } catch {
        /* skip malformed */
      }
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

  let quizData: QuizData = {
    id: `quiz_${Date.now().toString(36)}`,
    nodes,
    edges,
    camera: { x: 0, y: 0, z: 1 },
  };
  quizData = await rehostImages(quizData, quizData.id, warnings);

  const quizName = name ?? parsed.title ?? pageTitle;
  const settings: QuizSettings = {
    ...buildDefaultSettings(),
    metadata: { ...buildDefaultSettings().metadata, title: quizName },
  };

  const savedId = await saveQuizToDb(quizData, settings, {
    workspaceId,
    market,
    name: quizName,
  });

  return {
    quizId: savedId,
    method: "llm",
    importedSteps: stepNodes.length,
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

  // 3. Next.js multi-page fast-path (no browser needed)
  const nextjsResult = await importNextJsQuiz(url, workspaceId, market, name);
  if (nextjsResult) return nextjsResult;

  // 4. Generic fallback (puppeteer: carousel detection + click-through)
  try {
    const genericResult = await importGenericQuiz(url, workspaceId, market, name);
    if (genericResult.importedSteps >= 2) return genericResult;
  } catch (err) {
    console.warn("[swipeQuiz] generic importer threw, trying LLM fallback:", err);
  }

  // 5. LLM last-resort extraction (requires ANTHROPIC_API_KEY)
  const llmResult = await importLlmQuiz(url, workspaceId, market, name);
  if (llmResult) return llmResult;

  // Nothing worked — re-run generic (now likely throws) so the caller gets
  // the useful error message instead of a silent failure.
  return importGenericQuiz(url, workspaceId, market, name);
}
