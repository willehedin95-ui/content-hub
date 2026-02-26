"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Wand2, RefreshCw, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { SpyAd, ConceptProposal, Product, Language, PRODUCTS, LANGUAGES } from "@/types";
import { getDefaultLanguages } from "@/lib/settings";

type Phase = "select" | "loading" | "proposals" | "confirm";

const LOADING_MESSAGES = [
  "Analyzing competitor approach...",
  "Studying product brief...",
  "Brainstorming concepts...",
  "Writing hook variations...",
  "Crafting ad copy...",
  "Finalizing proposals...",
];

interface Props {
  open: boolean;
  onClose: () => void;
  ad: SpyAd;
}

export default function ConceptGeneratorModal({ open, onClose, ad }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("select");
  const [product, setProduct] = useState<Product>("happysleep");
  const [proposals, setProposals] = useState<ConceptProposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<ConceptProposal | null>(null);
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [expandedVisual, setExpandedVisual] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(
    () => new Set(getDefaultLanguages())
  );
  const [cost, setCost] = useState<{ input_tokens: number; output_tokens: number; cost_usd: number } | null>(null);

  // Rotate loading messages
  useEffect(() => {
    if (phase !== "loading") return;
    const interval = setInterval(() => {
      setLoadingMsg((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase("select");
      setProposals([]);
      setSelectedProposal(null);
      setError("");
      setExpandedVisual(null);
      setCost(null);
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "loading" && !submitting) {
        if (phase === "confirm") {
          setPhase("proposals");
          setSelectedProposal(null);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, phase, submitting, onClose]);

  if (!open) return null;

  async function handleGenerate() {
    setPhase("loading");
    setError("");
    setLoadingMsg(0);

    try {
      const res = await fetch(`/api/spy/ads/${ad.id}/generate-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, count: 4 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      setProposals(data.proposals);
      setCost(data.cost);
      setPhase("proposals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("select");
    }
  }

  async function handleApprove() {
    if (!selectedProposal) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/spy/ads/${ad.id}/approve-concept`, {
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

      const { job_id } = await res.json();
      onClose();
      router.push(`/images/${job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== "loading" && !submitting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create Concept</h2>
              <p className="text-xs text-gray-500">
                Inspired by {ad.brand?.name ?? "competitor"} ad
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={phase === "loading" || submitting}
            className="text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Phase: Product Selection */}
          {phase === "select" && (
            <div className="px-6 py-6 space-y-6">
              {/* Spy ad summary */}
              <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                {(ad.thumbnail_url || ad.media_url) && (
                  <img
                    src={ad.thumbnail_url || ad.media_url!}
                    alt="Ad thumbnail"
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">
                    {ad.brand?.name ?? "Unknown brand"}
                  </p>
                  <p className="text-sm font-medium text-gray-800 line-clamp-2 mt-0.5">
                    {ad.headline || ad.body?.slice(0, 100) || "No copy"}
                  </p>
                  {ad.cash_analysis?.angle && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                        {ad.cash_analysis.angle}
                      </span>
                      {ad.cash_analysis.style && (
                        <span className="text-[10px] text-fuchsia-600 bg-fuchsia-50 px-1.5 py-0.5 rounded border border-fuchsia-200">
                          {ad.cash_analysis.style}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Product selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Which product is this concept for?
                </label>
                <div className="flex gap-2">
                  {PRODUCTS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setProduct(p.value)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        product === p.value
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Generate Concept Ideas
              </button>
            </div>
          )}

          {/* Phase: Loading */}
          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
              <p className="text-sm font-medium text-gray-700 mb-1">
                {LOADING_MESSAGES[loadingMsg]}
              </p>
              <p className="text-xs text-gray-400">This takes about 15 seconds</p>
            </div>
          )}

          {/* Phase: Proposals */}
          {phase === "proposals" && (
            <div className="px-6 py-5 space-y-4">
              {/* Top bar */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{proposals.length} concepts</span> generated for{" "}
                  <span className="font-medium">
                    {PRODUCTS.find((p) => p.value === product)?.label}
                  </span>
                  {cost && (
                    <span className="text-gray-400 ml-2">
                      (${cost.cost_usd.toFixed(3)})
                    </span>
                  )}
                </p>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </button>
              </div>

              {/* Proposal cards */}
              <div className="space-y-4">
                {proposals.map((proposal, i) => (
                  <div
                    key={i}
                    className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors"
                  >
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div>
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
                          className="shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
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
                      </div>

                      {/* Hooks */}
                      <div className="mb-3">
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                          Hooks
                        </label>
                        <ul className="space-y-0.5">
                          {proposal.cash_dna.hooks.slice(0, 3).map((hook, j) => (
                            <li key={j} className="text-xs text-gray-700 flex items-start gap-1.5">
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

                      {/* Primary text preview */}
                      <div className="mb-3">
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                          Ad Copy (first variation)
                        </label>
                        <p className="text-xs text-gray-600 line-clamp-3">
                          {proposal.ad_copy_primary[0]}
                        </p>
                      </div>

                      {/* Visual direction (collapsible) */}
                      <button
                        onClick={() => setExpandedVisual(expandedVisual === i ? null : i)}
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
            <div className="px-6 py-6 space-y-5">
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
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
                </div>
              </div>

              {/* Product */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Product</label>
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

              {error && <p className="text-red-600 text-sm">{error}</p>}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    setPhase("proposals");
                    setSelectedProposal(null);
                    setError("");
                  }}
                  disabled={submitting}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                >
                  Back to proposals
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submitting || selectedLanguages.size === 0}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Create Concept
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
