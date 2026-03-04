"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Loader2,
  Sparkles,
  Users,
  Cog,
  Shuffle,
  Zap,
  ArrowRight,
  ImageIcon,
  Check,
  AlertCircle,
} from "lucide-react";
import type { ImageJob, CashDna } from "@/types";

interface IterationSuggestion {
  id: string;
  iteration_type: "segment_swap" | "mechanism_swap" | "cash_swap";
  title: string;
  rationale: string;
  params: {
    segment_id?: string;
    new_mechanism?: string;
    swap_element?: "hook" | "style" | "angle";
    new_value?: string;
  };
}

interface Props {
  job: ImageJob;
  performanceContext?: string; // Optional perf summary from Daily Actions
  onClose: () => void;
}

type Phase = "loading" | "suggestions" | "creating" | "generating" | "done" | "error";

export default function SmartIterateModal({ job, performanceContext, onClose }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [suggestions, setSuggestions] = useState<IterationSuggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [childJobId, setChildJobId] = useState<string | null>(null);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cashDna = job.cash_dna as CashDna | null;

  // Phase 1: Fetch AI suggestions
  useEffect(() => {
    let cancelled = false;

    async function fetchSuggestions() {
      try {
        const res = await fetch(`/api/image-jobs/${job.id}/suggest-iterations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            performance_context: performanceContext ?? null,
          }),
        });
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setError(data.error || "Failed to generate suggestions");
          setPhase("error");
          return;
        }

        setSuggestions(data.suggestions ?? []);
        setPhase("suggestions");
      } catch {
        if (!cancelled) {
          setError("Network error");
          setPhase("error");
        }
      }
    }

    fetchSuggestions();
    return () => { cancelled = true; };
  }, [job.id, performanceContext]);

  // Phase 2+3: Create iteration + trigger generation
  async function handleSelect(suggestion: IterationSuggestion) {
    setSelectedId(suggestion.id);
    setPhase("creating");
    setError(null);

    try {
      // Step 1: Create the iteration (child job)
      const iterateRes = await fetch(`/api/image-jobs/${job.id}/iterate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iteration_type: suggestion.iteration_type,
          ...suggestion.params,
        }),
      });
      const iterateData = await iterateRes.json();

      if (!iterateRes.ok) {
        setError(iterateData.error || "Failed to create iteration");
        setPhase("error");
        return;
      }

      const newChildId = iterateData.id as string;
      setChildJobId(newChildId);
      setPhase("generating");

      // Step 2: Trigger image generation
      const genRes = await fetch(`/api/image-jobs/${newChildId}/generate-static`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });

      if (!genRes.ok) {
        // Generation trigger failed, but iteration was created — navigate to it
        const genData = await genRes.json().catch(() => ({}));
        console.warn("[smart-iterate] Generation trigger failed:", genData.error);
        setPhase("done");
        return;
      }

      const genData = await genRes.json();
      setGeneratedCount(genData.generated ?? 0);
      setPhase("done");
    } catch (err) {
      console.error("[smart-iterate] Error:", err);
      setError("Something went wrong. Please try again.");
      setPhase("error");
    }
  }

  function handleViewResult() {
    if (childJobId) {
      router.push(`/images/${childJobId}`);
    }
    onClose();
  }

  const iterTypeIcon = (type: string) => {
    switch (type) {
      case "segment_swap": return <Users className="w-4 h-4" />;
      case "mechanism_swap": return <Cog className="w-4 h-4" />;
      case "cash_swap": return <Shuffle className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4" />;
    }
  };

  const iterTypeLabel = (type: string) => {
    switch (type) {
      case "segment_swap": return "Segment Swap";
      case "mechanism_swap": return "Mechanism Swap";
      case "cash_swap": return "C.A.S.H. Swap";
      default: return type;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <h3 className="text-base font-semibold text-gray-900">
              Smart Iterate
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Loading phase */}
          {phase === "loading" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-sm text-gray-500">
                Analyzing concept DNA and generating iteration ideas...
              </p>
              <p className="text-xs text-gray-400">
                {cashDna?.angle && `${cashDna.angle} angle`}
                {cashDna?.angle && cashDna?.awareness_level && " · "}
                {cashDna?.awareness_level && `${cashDna.awareness_level}`}
              </p>
            </div>
          )}

          {/* Suggestions phase */}
          {phase === "suggestions" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                Pick an iteration — images will generate automatically.
              </p>

              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s)}
                  className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-gray-100 group-hover:bg-indigo-100 flex items-center justify-center text-gray-400 group-hover:text-indigo-500 transition-colors">
                      {iterTypeIcon(s.iteration_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {s.title}
                        </p>
                        {i === 0 && (
                          <span className="flex-shrink-0 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            Safest
                          </span>
                        )}
                        {i === suggestions.length - 1 && suggestions.length > 1 && (
                          <span className="flex-shrink-0 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            Bold
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mb-1.5">
                        {iterTypeLabel(s.iteration_type)}
                        {s.params.swap_element && ` · ${s.params.swap_element}`}
                      </p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {s.rationale}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 mt-1 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Creating phase */}
          {phase === "creating" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-sm text-gray-500">
                Creating iteration and rewriting copy...
              </p>
              {selectedId && suggestions.find((s) => s.id === selectedId) && (
                <p className="text-xs text-gray-400">
                  {suggestions.find((s) => s.id === selectedId)!.title}
                </p>
              )}
            </div>
          )}

          {/* Generating phase */}
          {phase === "generating" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="relative">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <ImageIcon className="w-4 h-4 text-indigo-400 absolute -right-1 -bottom-1" />
              </div>
              <p className="text-sm text-gray-500">
                Generating images...
              </p>
              {generatedCount > 0 && (
                <p className="text-xs text-indigo-500 font-medium">
                  {generatedCount} image{generatedCount !== 1 ? "s" : ""} ready
                </p>
              )}
              <p className="text-xs text-gray-400">
                This takes 30-60 seconds
              </p>
            </div>
          )}

          {/* Done phase */}
          {phase === "done" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">
                  Iteration ready!
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {generatedCount > 0
                    ? `${generatedCount} image${generatedCount !== 1 ? "s" : ""} generated`
                    : "Concept created"}
                </p>
              </div>
              <button
                onClick={handleViewResult}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                <Zap className="w-4 h-4" />
                View Iteration
              </button>
            </div>
          )}

          {/* Error phase */}
          {phase === "error" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={() => {
                  setPhase("loading");
                  setError(null);
                  setSuggestions([]);
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
