"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Wand2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Leaf,
  BookOpen,
  Grid3X3,
  Eye,
  LayoutTemplate,
  ArrowLeft,
  ThumbsDown,
  Upload,
  X,
  Link,
  Copy,
  CheckCircle2,
  Video,
  Film,
  Mic,
  Play,
  Clapperboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ConceptProposal,
  VideoConceptProposal,
  PixarAnimationProposal,
  Product,
  PRODUCTS,
  BrainstormMode,
  AdTemplate,
  ProductSegment,
} from "@/types";
import { BRAINSTORM_MODES, AD_TEMPLATE_META } from "@/lib/brainstorm";
import { VIDEO_FORMATS, HOOK_TYPES } from "@/lib/constants";

interface LearningEntry {
  takeaway: string;
  outcome: string;
  angle?: string;
  awareness_level?: string;
  style?: string;
  concept_name?: string;
}

interface LearningsData {
  learnings: LearningEntry[];
  patterns: Record<string, { wins: number; losses: number }>;
}

type Phase = "configure" | "loading" | "proposals";

const LOADING_MESSAGES = [
  "Mining product knowledge...",
  "Applying C.A.S.H. framework...",
  "Exploring angles & awareness levels...",
  "Crafting hook variations...",
  "Writing ad copy...",
  "Finalizing proposals...",
];

const COMPETITOR_LOADING_MESSAGES = [
  "Analyzing competitor ad...",
  "Reverse-engineering visual structure...",
  "Mapping to C.A.S.H. framework...",
  "Generating adapted concepts...",
  "Creating images via Nano Banana...",
  "Uploading to storage...",
];

const VIDEO_LOADING_MESSAGES = [
  "Analyzing product for video angles...",
  "Selecting format and hook types...",
  "Writing UGC scripts...",
  "Crafting Sora prompts...",
  "Drafting ad copy...",
  "Finalizing video proposals...",
];

const PIXAR_LOADING_MESSAGES = [
  "Picking characters from body parts & objects...",
  "Writing sassy dialogue lines...",
  "Crafting Pixar-style image prompts...",
  "Building VEO video prompts...",
  "Drafting ad copy...",
  "Finalizing Pixar concepts...",
];

const MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Leaf,
  BookOpen,
  Grid3X3,
  Eye,
  LayoutTemplate,
  Copy,
  Video,
  Clapperboard,
};

export default function BrainstormGenerate() {
  const router = useRouter();

  // Phase state
  const [phase, setPhase] = useState<Phase>("configure");

  // Configure state
  const [product, setProduct] = useState<Product>("happysleep");
  const [mode, setMode] = useState<BrainstormMode>("from_scratch");
  const [count, setCount] = useState(3);
  const [organicText, setOrganicText] = useState("");
  const [researchText, setResearchText] = useState("");
  const [segments, setSegments] = useState<ProductSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>("");
  const [selectedTemplates, setSelectedTemplates] = useState<AdTemplate[]>([]);
  const [competitorImage, setCompetitorImage] = useState<File | null>(null);
  const [competitorImagePreview, setCompetitorImagePreview] = useState<string>("");
  const [competitorImageUrl, setCompetitorImageUrl] = useState<string>("");
  const [competitorAdCopy, setCompetitorAdCopy] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pixar animation state
  const [direction, setDirection] = useState("");
  const [pixarProposals, setPixarProposals] = useState<PixarAnimationProposal[]>([]);

  // Video UGC state
  const [videoFormat, setVideoFormat] = useState<string>("");
  const [videoHookType, setVideoHookType] = useState<string>("");
  const [videoLanguage, setVideoLanguage] = useState<string>("sv");
  const [videoDirection, setVideoDirection] = useState("");
  const [videoCharacterDesc, setVideoCharacterDesc] = useState("");
  const pipelineMode = "multi_clip" as const;
  const [reuseFirstFrame, setReuseFirstFrame] = useState(true);
  const [productPlacement, setProductPlacement] = useState(false);
  const [productPlacementStyle, setProductPlacementStyle] = useState<string>("held_in_hand");
  const [productVisualDesc, setProductVisualDesc] = useState("");

  // Proposal state
  const [proposals, setProposals] = useState<ConceptProposal[]>([]);
  const [videoProposals, setVideoProposals] = useState<VideoConceptProposal[]>([]);
  const [resultType, setResultType] = useState<"static" | "video_ugc" | "pixar_animation">("static");
  const [expandedVisual, setExpandedVisual] = useState<number | null>(null);
  const [expandedCopy, setExpandedCopy] = useState<number | null>(null);
  const [expandedScript, setExpandedScript] = useState<number | null>(null);
  const [existingConceptsCount, setExistingConceptsCount] = useState(0);
  const [rejectingIdx, setRejectingIdx] = useState<number | null>(null);
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null);

  // Common
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState(0);

  // Streaming progress steps (used for all brainstorm modes)
  type ProgressStep = {
    step: string;
    message: string;
    done: boolean;
    job_id?: string;
    concept_name?: string;
    images_count?: number;
  };
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [cost, setCost] = useState<{
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  } | null>(null);

  // Elapsed time during loading
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (phase !== "loading") { setElapsedSec(0); return; }
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Learnings preview state
  const [learnings, setLearnings] = useState<LearningsData | null>(null);
  const [learningsOpen, setLearningsOpen] = useState(false);

  // Fetch learnings when product changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/learnings?product=${product}&limit=10`);
        if (res.ok && !cancelled) {
          setLearnings(await res.json());
        }
      } catch {
        // silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, [product]);

  // Fetch segments when product changes
  const fetchSegments = useCallback(async () => {
    try {
      const prodRes = await fetch("/api/products");
      if (!prodRes.ok) return;
      const prodData = await prodRes.json();
      const match = (prodData ?? []).find(
        (p: { slug: string }) => p.slug === product
      );
      if (!match) return;

      const segRes = await fetch(`/api/products/${match.id}/segments`);
      if (segRes.ok) {
        const segData = await segRes.json();
        setSegments(segData ?? []);
      }
    } catch {
      // silently ignore
    }
  }, [product]);

  useEffect(() => {
    fetchSegments();
    setSelectedSegment("");
  }, [fetchSegments]);

  // Rotate loading messages
  const activeLoadingMessages =
    mode === "from_competitor_ad"
      ? COMPETITOR_LOADING_MESSAGES
      : mode === "video_ugc"
        ? VIDEO_LOADING_MESSAGES
        : mode === "pixar_animation"
          ? PIXAR_LOADING_MESSAGES
          : LOADING_MESSAGES;

  useEffect(() => {
    if (phase !== "loading") return;
    const msgs =
      mode === "from_competitor_ad"
        ? COMPETITOR_LOADING_MESSAGES
        : mode === "video_ugc"
          ? VIDEO_LOADING_MESSAGES
          : mode === "pixar_animation"
            ? PIXAR_LOADING_MESSAGES
            : LOADING_MESSAGES;
    const interval = setInterval(() => {
      setLoadingMsg((prev) => (prev + 1) % msgs.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase, mode]);

  async function handleGenerate() {
    setPhase("loading");
    setError("");
    setLoadingMsg(0);
    setProgressSteps([]);

    try {
      // Competitor ad flow: upload image → stream NDJSON progress → redirect to image job
      if (mode === "from_competitor_ad" && (competitorImage || competitorImageUrl)) {
        let imageUrl = competitorImageUrl;

        // Initialize progress steps
        setProgressSteps([
          { step: "uploading", message: "Uploading competitor image...", done: false },
        ]);

        // If user uploaded a file, upload it to temp storage first
        if (competitorImage) {
          const formData = new FormData();
          formData.append("file", competitorImage);
          const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: formData });
          if (!uploadRes.ok) throw new Error("Failed to upload image");
          const uploadData = await uploadRes.json();
          imageUrl = uploadData.url;
        }

        // Mark upload done
        setProgressSteps((prev) =>
          prev.map((s) => (s.step === "uploading" ? { ...s, done: true, message: "Image uploaded" } : s))
        );

        // Call brainstorm API — reads NDJSON stream for real-time progress
        const res = await fetch("/api/brainstorm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            product,
            count,
            competitor_image_url: imageUrl,
            competitor_ad_copy: competitorAdCopy || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Generation failed");
        }

        // Read NDJSON stream
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let redirectJobId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);

              if (event.step === "error") {
                throw new Error(event.message);
              }

              if (event.step === "analyzing") {
                setProgressSteps((prev) => [
                  ...prev,
                  { step: "analyzing", message: event.message, done: false },
                ]);
              } else if (event.step === "analyzed") {
                setProgressSteps((prev) =>
                  prev.map((s) => (s.step === "analyzing" ? { ...s, done: true, message: event.message } : s))
                );
              } else if (event.step === "creating_concept") {
                setProgressSteps((prev) => [
                  ...prev,
                  { step: "creating_concept", message: event.message, done: false },
                ]);
              } else if (event.step === "concept_created") {
                setProgressSteps((prev) => [
                  ...prev.map((s) =>
                    s.step === "creating_concept"
                      ? { ...s, done: true, message: "Concept created" }
                      : s
                  ),
                  {
                    step: "concept_created",
                    message: event.concept_name,
                    done: true,
                    job_id: event.job_id,
                    concept_name: event.concept_name,
                    images_count: event.images_count,
                  },
                ]);
                redirectJobId = event.job_id;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== line) throw parseErr;
            }
          }
        }

        if (redirectJobId) {
          // Show "redirecting" step briefly then navigate
          setProgressSteps((prev) => [
            ...prev,
            { step: "redirecting", message: "Loading concept page...", done: false },
          ]);
          await new Promise((resolve) => setTimeout(resolve, 500));
          router.push(`/images/${redirectJobId}`);
        }
        return;
      }

      const reqBody: Record<string, unknown> = {
        mode,
        product,
        count,
      };

      if (mode === "from_organic" && organicText) reqBody.organic_text = organicText;
      if (mode === "from_research" && researchText) reqBody.research_text = researchText;
      if (mode === "from_template" && selectedTemplates.length > 0) reqBody.template_ids = selectedTemplates;
      if (selectedSegment) reqBody.segment_id = selectedSegment;

      if (mode === "pixar_animation") {
        if (direction.trim()) reqBody.direction = direction.trim();
      }

      if (mode === "video_ugc") {
        reqBody.language = videoLanguage;
        reqBody.pipeline_mode = pipelineMode;
        if (videoFormat) reqBody.format_type = videoFormat;
        if (videoHookType) reqBody.hook_type = videoHookType;
        if (videoDirection.trim()) reqBody.creative_direction = videoDirection.trim();
        if (videoCharacterDesc.trim()) reqBody.character_description = videoCharacterDesc.trim();
        if (productPlacement) {
          reqBody.product_placement = true;
          reqBody.product_placement_style = productPlacementStyle;
          if (productVisualDesc.trim()) reqBody.product_visual_description = productVisualDesc.trim();
        }
      }

      // Initialize progress steps
      const isVideo = mode === "video_ugc";
      setProgressSteps([
        {
          step: "generating",
          message: isVideo
            ? `Generating ${count} video concept${count > 1 ? "s" : ""} with AI (this takes 1-3 min)...`
            : "Generating concepts with AI...",
          done: false,
        },
      ]);

      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }

      // Read NDJSON stream for real-time progress
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            if (event.step === "error") {
              throw new Error(event.message);
            }

            if (event.step === "generating") {
              setProgressSteps([
                { step: "generating", message: event.message, done: false },
              ]);
            } else if (event.step === "retrying") {
              setProgressSteps((prev) => [
                ...prev,
                { step: "retrying", message: event.message, done: false },
              ]);
            } else if (event.step === "generated") {
              setProgressSteps((prev) =>
                prev.map((s) => (s.step === "generating" ? { ...s, done: true, message: event.message } : s))
              );
            } else if (event.step === "parsing") {
              setProgressSteps((prev) => [
                ...prev,
                { step: "parsing", message: event.message, done: false },
              ]);
            } else if (event.step === "translating") {
              setProgressSteps((prev) => [
                ...prev.map((s) => (s.step === "generating" ? { ...s, done: true } : s)),
                { step: "translating", message: event.message, done: false },
              ]);
            } else if (event.step === "translation_warning") {
              setProgressSteps((prev) => [
                ...prev.map((s) => (s.step === "translating" ? { ...s, done: true, message: event.message } : s)),
              ]);
            } else if (event.step === "done") {
              setProgressSteps((prev) => [
                ...prev.map((s) =>
                  s.step === "parsing" ? { ...s, done: true, message: "Proposals parsed" } :
                  s.step === "translating" ? { ...s, done: true, message: "Scripts translated" } : s
                ),
                { step: "done", message: event.message, done: true },
              ]);

              if (event.type === "video_ugc") {
                setVideoProposals(event.proposals);
                setResultType("video_ugc");
              } else if (event.type === "pixar_animation") {
                setPixarProposals(event.proposals);
                setResultType("pixar_animation");
              } else {
                setProposals(event.proposals);
                setResultType("static");
              }
              setCost(event.cost);
              setExistingConceptsCount(event.existing_concepts_count ?? 0);

              // Brief pause to show completion before switching to proposals view
              await new Promise((resolve) => setTimeout(resolve, 400));
              setPhase("proposals");
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== line) throw parseErr;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("configure");
    }
  }

  async function handleApprove(proposal: ConceptProposal, idx: number) {
    if (approvingIdx !== null) return;
    setApprovingIdx(idx);
    setError("");

    try {
      const res = await fetch("/api/brainstorm/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal,
          product,
          target_ratios: ["4:5", "9:16"],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create concept");
      }

      const data = await res.json();
      router.push(`/images/${data.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setApprovingIdx(null);
    }
  }

  async function handleApproveVideo(proposal: VideoConceptProposal, idx: number) {
    if (approvingIdx !== null) return;
    setApprovingIdx(idx);
    setError("");

    try {
      const res = await fetch("/api/video-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          concept_name: proposal.concept_name,
          hook_type: proposal.hook_type,
          script_structure: proposal.script_structure,
          format_type: proposal.format_type,
          script: proposal.script,
          sora_prompt: proposal.sora_prompt,
          character_description: proposal.character_description,
          duration_seconds: 12,
          target_languages: [videoLanguage],
          awareness_level: proposal.awareness_level,
          delivery_style: proposal.delivery_style,
          ad_copy_primary: proposal.ad_copy_primary,
          ad_copy_headline: proposal.ad_copy_headline,
          product_description: proposal.product_description || null,
          pipeline_mode: pipelineMode,
          reuse_first_frame: reuseFirstFrame,
          shots: proposal.shots,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create video job");
      }

      const job = await res.json();
      router.push(`/video-ads/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setApprovingIdx(null);
    }
  }

  async function handleApprovePixar(proposal: PixarAnimationProposal, idx: number) {
    if (approvingIdx !== null) return;
    setApprovingIdx(idx);
    setError("");

    try {
      const res = await fetch("/api/video-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          concept_name: proposal.concept_name,
          hook_type: proposal.hook_type,
          format_type: "pixar_animation",
          script: proposal.dialogue,
          character_description: proposal.character_image_prompt,
          sora_prompt: proposal.veo_prompt,
          duration_seconds: proposal.duration_seconds || 8,
          awareness_level: proposal.awareness_level,
          ad_copy_primary: proposal.ad_copy_primary,
          ad_copy_headline: proposal.ad_copy_headline,
          style_notes: JSON.stringify({
            character_object: proposal.character_object,
            character_category: proposal.character_category,
            character_mood: proposal.character_mood,
            animation_style: "pixar",
          }),
          pipeline_mode: "single_clip",
          max_shots: 1,
          reuse_first_frame: true,
          shots: [
            {
              shot_number: 1,
              shot_description: proposal.character_image_prompt,
              veo_prompt: proposal.veo_prompt,
              duration_seconds: proposal.duration_seconds || 8,
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create video job");
      }

      const job = await res.json();
      router.push(`/video-ads/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setApprovingIdx(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Phase: Configure */}
      {phase === "configure" && (
        <div className="space-y-6">
          {/* Product selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product
            </label>
            <div className="flex gap-2">
              {PRODUCTS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setProduct(p.value)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    product === p.value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Brainstorm Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {BRAINSTORM_MODES.map((m) => {
                const Icon = MODE_ICONS[m.icon] ?? Sparkles;
                return (
                  <button
                    key={m.value}
                    onClick={() => {
                      setMode(m.value);
                      // Video UGC defaults to 1 concept (large output per concept)
                      if (m.value === "video_ugc") setCount(1);
                      else if (count === 1 && mode === "video_ugc") setCount(3);
                    }}
                    className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      mode === m.value
                        ? "bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        mode === m.value
                          ? "bg-indigo-100 text-indigo-600"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          mode === m.value ? "text-indigo-900" : "text-gray-900"
                        }`}
                      >
                        {m.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {m.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode-specific inputs */}
          {mode === "from_organic" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organic Content
              </label>
              <textarea
                value={organicText}
                onChange={(e) => setOrganicText(e.target.value)}
                placeholder="Paste viral post, article, Reddit thread, or any organic content that resonated..."
                className="w-full h-40 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Claude will analyze what makes this content work and adapt it into ad concepts
              </p>
            </div>
          )}

          {mode === "from_research" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Research / Data
              </label>
              <textarea
                value={researchText}
                onChange={(e) => setResearchText(e.target.value)}
                placeholder="Paste research findings, statistics, studies, customer comments, review data..."
                className="w-full h-40 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Claude will extract compelling stats and build concepts around them
              </p>
            </div>
          )}

          {/* Template selector (for from_template) */}
          {mode === "from_template" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ad Templates
                <span className="font-normal text-gray-400 ml-1">
                  (select specific templates or leave empty for AI to choose)
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AD_TEMPLATE_META.map((t) => {
                  const selected = selectedTemplates.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        setSelectedTemplates((prev) =>
                          selected
                            ? prev.filter((id) => id !== t.id)
                            : [...prev, t.id]
                        )
                      }
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        selected
                          ? "bg-amber-50 border-amber-300 ring-1 ring-amber-200"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          selected
                            ? "bg-amber-500 border-amber-500 text-white"
                            : "border-gray-300"
                        }`}
                      >
                        {selected && (
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${selected ? "text-amber-900" : "text-gray-900"}`}>
                            {t.name}
                          </span>
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {t.hookType}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{t.bestFor}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedTemplates.length > 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  {selectedTemplates.length} template{selectedTemplates.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          )}

          {/* Competitor ad upload (for from_competitor_ad) */}
          {mode === "from_competitor_ad" && (
            <div className="space-y-4">
              {/* Image input area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Competitor Ad Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCompetitorImage(file);
                      setCompetitorImageUrl("");
                      setCompetitorImagePreview(URL.createObjectURL(file));
                    }
                    e.target.value = "";
                  }}
                />
                {!competitorImage && !competitorImageUrl ? (
                  <div className="space-y-3">
                    {/* Upload / paste drop zone */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onPaste={(e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        for (const item of Array.from(items)) {
                          if (item.type.startsWith("image/")) {
                            e.preventDefault();
                            const file = item.getAsFile();
                            if (file) {
                              setCompetitorImage(file);
                              setCompetitorImageUrl("");
                              setCompetitorImagePreview(URL.createObjectURL(file));
                            }
                            return;
                          }
                        }
                      }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith("image/")) {
                          setCompetitorImage(file);
                          setCompetitorImageUrl("");
                          setCompetitorImagePreview(URL.createObjectURL(file));
                        }
                      }}
                      tabIndex={0}
                      className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500">
                        Click to upload, drag & drop, or paste from clipboard
                      </span>
                      <span className="text-xs text-gray-400 mt-1">
                        PNG, JPG, or WebP
                      </span>
                    </div>

                    {/* OR divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400">or paste image URL</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {/* URL input */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="url"
                          value={competitorImageUrl}
                          onChange={(e) => setCompetitorImageUrl(e.target.value)}
                          placeholder="https://example.com/ad-image.jpg"
                          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={competitorImagePreview || competitorImageUrl}
                      alt="Competitor ad preview"
                      className="max-h-64 rounded-xl border border-gray-200 object-contain"
                    />
                    <button
                      onClick={() => {
                        if (competitorImagePreview) {
                          URL.revokeObjectURL(competitorImagePreview);
                        }
                        setCompetitorImage(null);
                        setCompetitorImagePreview("");
                        setCompetitorImageUrl("");
                      }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Optional ad copy textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Competitor Ad Copy (optional)
                </label>
                <textarea
                  value={competitorAdCopy}
                  onChange={(e) => setCompetitorAdCopy(e.target.value)}
                  placeholder="Paste the competitor's primary text and headline from Meta Ads Library..."
                  className="w-full h-28 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Adding the ad copy helps Claude better understand the competitor&apos;s strategy
                </p>
              </div>
            </div>
          )}

          {/* Video UGC inputs */}
          {mode === "video_ugc" && (
            <div className="space-y-4">
              {/* Reuse First Frame toggle */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <input
                  type="checkbox"
                  id="reuse-first-frame"
                  checked={reuseFirstFrame}
                  onChange={(e) => setReuseFirstFrame(e.target.checked)}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="reuse-first-frame" className="text-sm cursor-pointer">
                  <span className="font-medium text-amber-800">Reuse first frame for all shots</span>
                  <span className="block text-[11px] text-amber-600 mt-0.5">
                    Recommended for talking head UGC — generates one keyframe and reuses it for all clips, guaranteeing perfect character consistency.
                  </span>
                </label>
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Language
                </label>
                <div className="flex gap-2">
                  {[
                    { value: "sv", label: "Swedish" },
                    { value: "no", label: "Norwegian" },
                    { value: "da", label: "Danish" },
                  ].map((l) => (
                    <button
                      key={l.value}
                      onClick={() => setVideoLanguage(l.value)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        videoLanguage === l.value
                          ? "bg-purple-50 border-purple-300 text-purple-700"
                          : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Concept generated in English, then translated to native-quality script
                </p>
              </div>

              {/* Video Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Format
                  <span className="font-normal text-gray-400 ml-1">(optional — AI picks if empty)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {VIDEO_FORMATS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setVideoFormat(videoFormat === f.id ? "" : f.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        videoFormat === f.id
                          ? "bg-purple-50 border-purple-300 text-purple-700"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                      title={f.description}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hook Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hook Type
                  <span className="font-normal text-gray-400 ml-1">(optional — AI picks if empty)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {HOOK_TYPES.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setVideoHookType(videoHookType === h.id ? "" : h.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        videoHookType === h.id
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                      title={h.description}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Creative Direction */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Creative Direction
                  <span className="font-normal text-gray-400 ml-1">(optional)</span>
                </label>
                <textarea
                  value={videoDirection}
                  onChange={(e) => setVideoDirection(e.target.value)}
                  placeholder="Describe your vision... e.g. &quot;A tired mom discovering the product on her nightstand, intimate bedroom setting, 2 AM insomnia vibe&quot;"
                  className="w-full h-24 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 resize-none"
                />
              </div>

              {/* Character Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Character Description
                  <span className="font-normal text-gray-400 ml-1">(optional)</span>
                </label>
                <textarea
                  value={videoCharacterDesc}
                  onChange={(e) => setVideoCharacterDesc(e.target.value)}
                  placeholder="e.g. &quot;Woman, late 30s, Scandinavian, light brown hair in messy bun, no makeup, wearing oversized grey t-shirt&quot;"
                  className="w-full h-20 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Describe the person in the video — age, appearance, clothing, mood
                </p>
              </div>

              {/* Product Placement toggle */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Product Placement</label>
                    <p className="text-xs text-gray-400">Show product in the video (optional — not every UGC ad needs it)</p>
                  </div>
                  <button
                    onClick={() => setProductPlacement(!productPlacement)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      productPlacement ? "bg-purple-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        productPlacement ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>

                {productPlacement && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    {/* Visual Description */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Visual Description
                        <span className="font-normal text-gray-400 ml-1">(optional — AI will use product bank if empty)</span>
                      </label>
                      <input
                        type="text"
                        value={productVisualDesc}
                        onChange={(e) => setProductVisualDesc(e.target.value)}
                        placeholder="e.g. White contoured memory foam pillow with grey jersey cover"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                      />
                    </div>

                    {/* Placement Style */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Placement Style</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "held_in_hand", label: "Held in hand" },
                          { value: "on_table", label: "On table" },
                          { value: "in_background", label: "In background" },
                          { value: "unboxing", label: "Unboxing" },
                          { value: "using_it", label: "Using it" },
                        ].map((s) => (
                          <button
                            key={s.value}
                            onClick={() => setProductPlacementStyle(s.value)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              productPlacementStyle === s.value
                                ? "bg-purple-50 border-purple-300 text-purple-700"
                                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pixar Animation inputs */}
          {mode === "pixar_animation" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Creative Direction
                  <span className="font-normal text-gray-400 ml-1">(optional)</span>
                </label>
                <textarea
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  placeholder="e.g. Focus on body parts that suffer from bad sleep posture, use confrontational tone..."
                  className="w-full h-24 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Guide which characters, moods, or angles the AI should explore
                </p>
              </div>
            </div>
          )}

          {/* Segment selector */}
          {(mode === "from_scratch" || mode === "from_internal" || mode === "from_template") &&
            segments.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Focus Segment (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedSegment("")}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      !selectedSegment
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    All segments
                  </button>
                  {segments.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSegment(s.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        selectedSegment === s.id
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* Count selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of concepts
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
                    count === n
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {mode === "video_ugc"
                ? "~$0.15-0.20 per concept (includes shot storyboard). Image + video generation costs are separate."
                : "~$0.03-0.05 per generation (Claude Sonnet 4.5)"}
            </p>
          </div>

          {/* Learnings preview */}
          {learnings && learnings.learnings.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
              <button
                onClick={() => setLearningsOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left"
              >
                <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-medium text-amber-900 flex-1">
                  Past Learnings ({learnings.learnings.length})
                </span>
                <span className="text-xs text-amber-600">
                  AI sees these during brainstorm
                </span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-amber-500 transition-transform",
                    learningsOpen && "rotate-180"
                  )}
                />
              </button>
              {learningsOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {/* Pattern summary */}
                  {(() => {
                    const entries = Object.entries(learnings.patterns)
                      .map(([key, val]) => ({
                        key,
                        total: val.wins + val.losses,
                        winRate: val.wins / (val.wins + val.losses),
                        ...val,
                      }))
                      .filter((e) => e.total >= 2)
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 6);

                    return entries.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-medium text-amber-700 uppercase tracking-wide mb-1.5">
                          Patterns
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {entries.map((e) => {
                            const [category, label] = e.key.split(":");
                            return (
                              <div
                                key={e.key}
                                className="bg-white/70 rounded-lg px-3 py-2 border border-amber-100"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] text-amber-600">{category}</span>
                                  <span className="text-[10px] font-medium text-amber-800">
                                    {Math.round(e.winRate * 100)}% wins
                                  </span>
                                </div>
                                <p className="text-xs font-medium text-gray-900 truncate">{label}</p>
                                <div className="mt-1 h-1 rounded-full bg-amber-100 overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      e.winRate >= 0.5 ? "bg-emerald-500" : "bg-red-400"
                                    )}
                                    style={{ width: `${e.winRate * 100}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Recent takeaways */}
                  <div>
                    <p className="text-[10px] font-medium text-amber-700 uppercase tracking-wide mb-1.5">
                      Recent Takeaways
                    </p>
                    <div className="space-y-1.5">
                      {learnings.learnings
                        .filter((l) => l.takeaway)
                        .slice(0, 5)
                        .map((l, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 bg-white/70 rounded-lg px-3 py-2 border border-amber-100"
                          >
                            <span
                              className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5",
                                l.outcome === "winner"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700"
                              )}
                            >
                              {l.outcome === "winner" ? "W" : "L"}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-700">{l.takeaway}</p>
                              {l.concept_name && (
                                <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                                  {l.concept_name}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={
              (mode === "from_organic" && !organicText.trim()) ||
              (mode === "from_research" && !researchText.trim()) ||
              (mode === "from_competitor_ad" && !competitorImage && !competitorImageUrl.trim())
            }
            className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            Generate Concepts
          </button>
        </div>
      )}

      {/* Phase: Loading — checklist progress for all modes */}
      {phase === "loading" && progressSteps.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-full max-w-sm space-y-3">
            {progressSteps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                {s.done ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", s.done ? "text-gray-500" : "text-gray-800 font-medium")}>
                    {s.message}
                  </p>
                  {s.step === "concept_created" && s.images_count && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.images_count} images will be generated on the next page
                    </p>
                  )}
                </div>
              </div>
            ))}
            {/* Elapsed timer */}
            {elapsedSec > 3 && (
              <p className="text-xs text-gray-400 text-center pt-2">
                {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")} elapsed
              </p>
            )}
          </div>
        </div>
      ) : phase === "loading" ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
          <p className="text-sm text-gray-600 animate-pulse">
            {activeLoadingMessages[loadingMsg]}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            This usually takes 10-20 seconds
          </p>
        </div>
      ) : null}

      {/* Phase: Proposals */}
      {phase === "proposals" && (
        <div className="space-y-4">
          {/* Back + summary */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setPhase("configure");
                setProposals([]);
                setVideoProposals([]);
                setPixarProposals([]);
                setCost(null);
              }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to configure
            </button>
            <div className="flex items-center gap-3">
              {cost && (
                <span className="text-xs text-gray-400">
                  ${cost.cost_usd.toFixed(4)}
                </span>
              )}
              {mode === "from_internal" && existingConceptsCount > 0 && (
                <span className="text-xs text-gray-400">
                  {existingConceptsCount} existing concepts analyzed
                </span>
              )}
              <button
                onClick={handleGenerate}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
            </div>
          </div>

          {resultType === "video_ugc" ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Film className="w-5 h-5 text-purple-500" />
                {videoProposals.length} Video Concept{videoProposals.length !== 1 ? "s" : ""} Generated
              </h2>

              {/* Video Proposal cards */}
              <div className="space-y-4">
                {videoProposals.map((proposal, i) => (
                  <div
                    key={i}
                    className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors bg-white"
                  >
                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 mr-3">
                          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <Video className="w-4 h-4 text-purple-500 shrink-0" />
                            {proposal.concept_name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              setVideoProposals((prev) => prev.filter((_, idx) => idx !== i));
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Dismiss"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleApproveVideo(proposal, i)}
                            disabled={approvingIdx !== null}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {approvingIdx === i ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            Create Video Job
                          </button>
                        </div>
                      </div>

                      {/* Type badges */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                          {proposal.format_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                          {proposal.awareness_level}
                        </span>
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                          {proposal.hook_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                          {proposal.script_structure.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-medium text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded-lg border border-fuchsia-200">
                          {proposal.delivery_style}
                        </span>
                      </div>

                      {/* Script */}
                      <div className="mb-3">
                        <button
                          onClick={() =>
                            setExpandedScript(expandedScript === i ? null : i)
                          }
                          className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 hover:text-gray-700 uppercase tracking-wide transition-colors"
                        >
                          <Mic className="w-3 h-3" />
                          UGC Script
                          {expandedScript === i ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        {expandedScript === i ? (
                          <div className="mt-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                              {proposal.script}
                            </pre>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-600 line-clamp-3 mt-1">
                            {proposal.script}
                          </p>
                        )}
                      </div>

                      {/* Character Description */}
                      {proposal.character_description && (
                        <div className="mb-3">
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                            Character
                          </label>
                          <p className="text-xs text-gray-600">
                            {proposal.character_description}
                          </p>
                        </div>
                      )}

                      {/* Sora Prompt */}
                      <div className="mb-3">
                        <button
                          onClick={() =>
                            setExpandedVisual(expandedVisual === i ? null : i)
                          }
                          className="flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 uppercase tracking-wide transition-colors"
                        >
                          Sora Prompt
                          {expandedVisual === i ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        {expandedVisual === i && (
                          <div className="mt-1 bg-gray-50 rounded-lg p-2 border border-gray-100">
                            <p className="text-xs text-gray-600 font-mono whitespace-pre-wrap">
                              {proposal.sora_prompt}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Ad Copy */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                            Ad Headline
                          </label>
                          <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                            {proposal.ad_copy_headline}
                          </p>
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                            Primary Text
                          </label>
                          <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                            {proposal.ad_copy_primary}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : resultType === "pixar_animation" ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Clapperboard className="w-5 h-5 text-indigo-500" />
                {pixarProposals.length} Pixar Concept{pixarProposals.length !== 1 ? "s" : ""} Generated
              </h2>

              {/* Pixar Proposal cards */}
              <div className="space-y-4">
                {pixarProposals.map((proposal, i) => (
                  <div
                    key={i}
                    className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors bg-white"
                  >
                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 mr-3">
                          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <Clapperboard className="w-4 h-4 text-indigo-500 shrink-0" />
                            {proposal.concept_name}
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {proposal.character_object} &middot; {proposal.character_mood}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              setPixarProposals((prev) => prev.filter((_, idx) => idx !== i));
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Dismiss"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleApprovePixar(proposal, i)}
                            disabled={approvingIdx !== null}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {approvingIdx === i ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Wand2 className="w-3 h-3" />
                            )}
                            Approve
                          </button>
                        </div>
                      </div>

                      {/* Type badges */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                          {proposal.hook_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                          {proposal.awareness_level.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                          {proposal.character_category.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                          {proposal.duration_seconds}s
                        </span>
                      </div>

                      {/* Dialogue */}
                      <div className="mb-3">
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                          Dialogue
                        </label>
                        <p className="text-sm text-gray-800 bg-indigo-50 rounded-lg px-4 py-3 italic border border-indigo-100">
                          &ldquo;{proposal.dialogue}&rdquo;
                        </p>
                      </div>

                      {/* Character Image Prompt */}
                      <div className="mb-3">
                        <button
                          onClick={() =>
                            setExpandedVisual(expandedVisual === i ? null : i)
                          }
                          className="flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 uppercase tracking-wide transition-colors"
                        >
                          Character Image Prompt
                          {expandedVisual === i ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        {expandedVisual === i && (
                          <div className="mt-1 bg-gray-50 rounded-lg p-2 border border-gray-100">
                            <p className="text-xs text-gray-600 font-mono whitespace-pre-wrap">
                              {proposal.character_image_prompt}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* VEO Prompt */}
                      <div className="mb-3">
                        <button
                          onClick={() =>
                            setExpandedScript(expandedScript === i ? null : i)
                          }
                          className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 hover:text-gray-700 uppercase tracking-wide transition-colors"
                        >
                          <Film className="w-3 h-3" />
                          VEO Prompt
                          {expandedScript === i ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        {expandedScript === i && (
                          <div className="mt-1 bg-gray-50 rounded-lg p-2 border border-gray-100">
                            <p className="text-xs text-gray-600 font-mono whitespace-pre-wrap">
                              {proposal.veo_prompt}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Ad Copy */}
                      <div className="mb-3">
                        <button
                          onClick={() =>
                            setExpandedCopy(expandedCopy === i ? null : i)
                          }
                          className="flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 uppercase tracking-wide transition-colors"
                        >
                          Ad Copy
                          {expandedCopy === i ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        {expandedCopy === i && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                            <div>
                              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                                Ad Headline
                              </label>
                              <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                                {proposal.ad_copy_headline}
                              </p>
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                                Primary Text
                              </label>
                              <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                                {proposal.ad_copy_primary}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900">
                {proposals.length} Concept{proposals.length !== 1 ? "s" : ""} Generated
              </h2>

              {/* Proposal cards */}
              <div className="space-y-4">
                {proposals.map((proposal, i) => (
                  <div
                    key={i}
                    className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors bg-white"
                  >
                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 mr-3">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {proposal.concept_name}
                          </h3>
                          <p className="text-xs text-gray-500 italic mt-0.5">
                            {proposal.concept_description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={async () => {
                              setRejectingIdx(i);
                              try {
                                await fetch("/api/brainstorm/reject", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    product,
                                    angle: proposal.cash_dna.angle ?? null,
                                    awareness_level: proposal.cash_dna.awareness_level ?? null,
                                    concept_description: proposal.concept_description ?? null,
                                  }),
                                });
                                setProposals((prev) => prev.filter((_, idx) => idx !== i));
                              } catch {}
                              setRejectingIdx(null);
                            }}
                            disabled={rejectingIdx === i}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Reject — avoid similar concepts in future"
                          >
                            {rejectingIdx === i ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ThumbsDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleApprove(proposal, i)}
                            disabled={approvingIdx !== null}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {approvingIdx === i ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Wand2 className="w-3 h-3" />
                            )}
                            Use This
                          </button>
                        </div>
                      </div>

                      {/* CASH badges */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {proposal.cash_dna.angle && (
                          <span className="text-[10px] font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg border border-violet-200">
                            {proposal.cash_dna.angle}
                          </span>
                        )}
                        {proposal.cash_dna.style && (
                          <span className="text-[10px] font-medium text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded-lg border border-fuchsia-200">
                            {proposal.cash_dna.style}
                          </span>
                        )}
                        {proposal.cash_dna.awareness_level && (
                          <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                            {proposal.cash_dna.awareness_level}
                          </span>
                        )}
                        {proposal.cash_dna.concept_type && (
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                            {proposal.cash_dna.concept_type}
                          </span>
                        )}
                        {proposal.cash_dna.ad_source && (
                          <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                            {proposal.cash_dna.ad_source}
                          </span>
                        )}
                      </div>

                      {/* Hooks */}
                      <div className="mb-3">
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                          Hooks
                        </label>
                        <ul className="space-y-0.5">
                          {proposal.cash_dna.hooks.slice(0, 4).map((hook, j) => (
                            <li
                              key={j}
                              className="text-xs text-gray-700 flex items-start gap-1.5"
                            >
                              <span className="text-gray-400 shrink-0">&bull;</span>
                              {hook}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Headlines */}
                      {(() => {
                        const allHeadlines = [
                          ...proposal.ad_copy_headline,
                          ...(proposal.native_headlines ?? []).filter(
                            (h) => !proposal.ad_copy_headline.includes(h)
                          ),
                        ];
                        return allHeadlines.length > 0 ? (
                          <div className="mb-3">
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                              Headlines
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {allHeadlines.map((h, j) => (
                                <span
                                  key={j}
                                  className="text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded"
                                >
                                  {h}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}

                      {/* Primary text preview */}
                      <div className="mb-3">
                        <button
                          onClick={() =>
                            setExpandedCopy(expandedCopy === i ? null : i)
                          }
                          className="flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 uppercase tracking-wide transition-colors"
                        >
                          Ad Copy ({proposal.ad_copy_primary.length} variation
                          {proposal.ad_copy_primary.length !== 1 ? "s" : ""})
                          {expandedCopy === i ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        {expandedCopy === i ? (
                          <div className="space-y-2 mt-1">
                            {proposal.ad_copy_primary.map((text, j) => (
                              <p
                                key={j}
                                className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3"
                              >
                                {text}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-600 line-clamp-2 mt-1">
                            {proposal.ad_copy_primary[0]}
                          </p>
                        )}
                      </div>

                      {/* Visual direction */}
                      <button
                        onClick={() =>
                          setExpandedVisual(expandedVisual === i ? null : i)
                        }
                        className="flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 uppercase tracking-wide transition-colors"
                      >
                        Visual Direction
                        {expandedVisual === i ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                      {expandedVisual === i && (
                        <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded-lg p-2">
                          {proposal.visual_direction}
                        </p>
                      )}

                      {/* Differentiation note */}
                      <p className="text-[10px] text-gray-400 mt-2 italic">
                        {proposal.differentiation_note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
