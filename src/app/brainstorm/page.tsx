"use client";

import { useState, useEffect, useCallback } from "react";
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
  Lightbulb,
  ArrowLeft,
} from "lucide-react";
import {
  ConceptProposal,
  Product,
  Language,
  PRODUCTS,
  LANGUAGES,
  BrainstormMode,
  UnawareAdType,
  ProductSegment,
} from "@/types";
import { getDefaultLanguages } from "@/lib/settings";
import { BRAINSTORM_MODES } from "@/lib/brainstorm";

type Phase = "configure" | "loading" | "proposals" | "confirm";

const LOADING_MESSAGES = [
  "Mining product knowledge...",
  "Applying C.A.S.H. framework...",
  "Exploring angles & awareness levels...",
  "Crafting hook variations...",
  "Writing ad copy...",
  "Finalizing proposals...",
];

const MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Leaf,
  BookOpen,
  Grid3X3,
  Eye,
};

const UNAWARE_TYPE_OPTIONS: { value: UnawareAdType; label: string; description: string }[] = [
  { value: "straddle", label: "Straddle", description: "Curiosity gap + broad relevance pain/promise" },
  { value: "symptom", label: "Symptom", description: "Neutral reference reframed as a warning sign" },
  { value: "worldview_porn", label: "Worldview Porn", description: "Tap emotional reservoirs (distrust, resentment) → redirect to product" },
  { value: "story", label: "Story (P.I.G.)", description: "Cinematic opening: Place + Identity + Gritty detail" },
];

export default function BrainstormPage() {
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
  const [unawareTypes, setUnawareTypes] = useState<Set<UnawareAdType>>(
    new Set(["straddle", "symptom", "worldview_porn", "story"])
  );

  // Proposal state
  const [proposals, setProposals] = useState<ConceptProposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<ConceptProposal | null>(null);
  const [expandedVisual, setExpandedVisual] = useState<number | null>(null);
  const [expandedCopy, setExpandedCopy] = useState<number | null>(null);
  const [existingConceptsCount, setExistingConceptsCount] = useState(0);

  // Confirm state
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(
    () => new Set(getDefaultLanguages())
  );
  const [submitting, setSubmitting] = useState(false);

  // Common
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [cost, setCost] = useState<{
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  } | null>(null);

  // Fetch segments when product changes
  const fetchSegments = useCallback(async () => {
    try {
      // Fetch all products to get UUID for the selected slug
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
  useEffect(() => {
    if (phase !== "loading") return;
    const interval = setInterval(() => {
      setLoadingMsg((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase]);

  async function handleGenerate() {
    setPhase("loading");
    setError("");
    setLoadingMsg(0);

    try {
      const body: Record<string, unknown> = {
        mode,
        product,
        count,
      };

      if (mode === "from_organic" && organicText) body.organic_text = organicText;
      if (mode === "from_research" && researchText) body.research_text = researchText;
      if (selectedSegment) body.segment_id = selectedSegment;
      if (mode === "unaware" && unawareTypes.size > 0) {
        body.unaware_types = Array.from(unawareTypes);
      }

      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      setProposals(data.proposals);
      setCost(data.cost);
      setExistingConceptsCount(data.existing_concepts_count ?? 0);
      setPhase("proposals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("configure");
    }
  }

  async function handleApprove() {
    if (!selectedProposal) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/brainstorm/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: selectedProposal,
          product,
          target_languages: Array.from(selectedLanguages),
          target_ratios: ["1:1"],
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
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Brainstorm</h1>
          <p className="text-sm text-gray-500">
            Generate ad concepts from first principles — no competitor ad needed
          </p>
        </div>
      </div>

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
                    onClick={() => setMode(m.value)}
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

          {mode === "unaware" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unaware Ad Types
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {UNAWARE_TYPE_OPTIONS.map((opt) => {
                  const selected = unawareTypes.has(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setUnawareTypes((prev) => {
                          const next = new Set(prev);
                          if (next.has(opt.value)) next.delete(opt.value);
                          else next.add(opt.value);
                          return next;
                        });
                      }}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        selected
                          ? "bg-amber-50 border-amber-300"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 mt-0.5 rounded border shrink-0 flex items-center justify-center ${
                          selected
                            ? "bg-amber-500 border-amber-500"
                            : "border-gray-300"
                        }`}
                      >
                        {selected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            selected ? "text-amber-900" : "text-gray-700"
                          }`}
                        >
                          {opt.label}
                        </p>
                        <p className="text-xs text-gray-500">{opt.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Segment selector (for from_scratch, from_internal) */}
          {(mode === "from_scratch" || mode === "from_internal") &&
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
              ~$0.03-0.05 per generation (Claude Sonnet 4.5)
            </p>
          </div>

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
              (mode === "from_research" && !researchText.trim())
            }
            className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            Generate Concepts
          </button>
        </div>
      )}

      {/* Phase: Loading */}
      {phase === "loading" && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
          <p className="text-sm text-gray-600 animate-pulse">
            {LOADING_MESSAGES[loadingMsg]}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            This usually takes 10-20 seconds
          </p>
        </div>
      )}

      {/* Phase: Proposals */}
      {phase === "proposals" && (
        <div className="space-y-4">
          {/* Back + summary */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setPhase("configure");
                setProposals([]);
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
                    <button
                      onClick={() => {
                        setSelectedProposal(proposal);
                        setPhase("confirm");
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                    >
                      <Wand2 className="w-3 h-3" />
                      Use This
                    </button>
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
                  <div className="mb-3">
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                      Headlines
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {proposal.ad_copy_headline.map((h, j) => (
                        <span
                          key={j}
                          className="text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Native Headlines (unaware mode) */}
                  {proposal.native_headlines && proposal.native_headlines.length > 0 && (
                    <div className="mb-3">
                      <label className="text-[10px] font-medium text-amber-600 uppercase tracking-wide mb-1 block">
                        Native/Editorial Headlines
                      </label>
                      <ul className="space-y-0.5">
                        {proposal.native_headlines.map((h, j) => (
                          <li
                            key={j}
                            className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 border border-amber-200"
                          >
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Primary text preview (expandable) */}
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

                  {/* Visual direction (collapsible) */}
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
        </div>
      )}

      {/* Phase: Confirm */}
      {phase === "confirm" && selectedProposal && (
        <div className="space-y-6">
          <button
            onClick={() => {
              setPhase("proposals");
              setSelectedProposal(null);
              setError("");
            }}
            disabled={submitting}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to proposals
          </button>

          <h2 className="text-lg font-semibold text-gray-900">
            Approve Concept
          </h2>

          {/* Selected proposal summary */}
          <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-xl">
            <h3 className="text-sm font-semibold text-indigo-900 mb-1">
              {selectedProposal.concept_name}
            </h3>
            <p className="text-xs text-indigo-700 italic">
              {selectedProposal.concept_description}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedProposal.cash_dna.angle && (
                <span className="text-[10px] font-medium text-violet-700 bg-white px-2 py-0.5 rounded border border-violet-200">
                  {selectedProposal.cash_dna.angle}
                </span>
              )}
              {selectedProposal.cash_dna.style && (
                <span className="text-[10px] font-medium text-fuchsia-700 bg-white px-2 py-0.5 rounded border border-fuchsia-200">
                  {selectedProposal.cash_dna.style}
                </span>
              )}
              {selectedProposal.cash_dna.awareness_level && (
                <span className="text-[10px] font-medium text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                  {selectedProposal.cash_dna.awareness_level}
                </span>
              )}
            </div>
          </div>

          {/* Product */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Product
            </label>
            <span className="text-sm text-indigo-600 font-medium bg-indigo-50 px-3 py-1.5 rounded-lg">
              {PRODUCTS.find((p) => p.value === product)?.label}
            </span>
          </div>

          {/* Languages */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Languages
            </label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => {
                const selected = selectedLanguages.has(lang.value);
                return (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => {
                      setSelectedLanguages((prev) => {
                        const next = new Set(prev);
                        if (next.has(lang.value)) next.delete(lang.value);
                        else next.add(lang.value);
                        return next;
                      });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <span role="img" aria-label={lang.label}>
                      {lang.flag}
                    </span>
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          {/* Create button */}
          <button
            onClick={handleApprove}
            disabled={submitting || selectedLanguages.size === 0}
            className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating concept...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Create Concept
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
