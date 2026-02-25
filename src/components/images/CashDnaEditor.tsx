"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles, Loader2, ChevronDown, ChevronUp, Dna } from "lucide-react";
import {
  type CashDna, type ConceptCategory, type Angle, type Style,
  type AwarenessLevel, type AdSource, type CopyBlock,
  CONCEPT_CATEGORIES, ANGLES, STYLES,
  AWARENESS_LEVELS, AD_SOURCES, COPY_BLOCKS,
} from "@/types";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  jobId: string;
  initialDna: CashDna | null;
  hasAdCopy: boolean;
}

const EMPTY_DNA: CashDna = {
  concept_type: null,
  angle: null,
  style: null,
  hooks: [],
  awareness_level: null,
  ad_source: null,
  copy_blocks: [],
  concept_description: "",
};

// Placeholder value for "None" option — Radix Select doesn't support empty string
const NONE = "__none__";

export default function CashDnaEditor({ jobId, initialDna, hasAdCopy }: Props) {
  const [dna, setDna] = useState<CashDna>(initialDna ?? EMPTY_DNA);
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const saveDna = useCallback((updated: CashDna) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await fetch(`/api/image-jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cash_dna: updated }),
      });
    }, 1000);
  }, [jobId]);

  function update(patch: Partial<CashDna>) {
    setDna(prev => {
      const next = { ...prev, ...patch };
      saveDna(next);
      return next;
    });
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/image-jobs/${jobId}/analyze-dna`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDna(data.cash_dna);
        setExpanded(true);
      }
    } catch { /* ignore */ }
    finally { setAnalyzing(false); }
  }

  function toggleCopyBlock(block: CopyBlock) {
    const current = dna.copy_blocks ?? [];
    const next = current.includes(block)
      ? current.filter(b => b !== block)
      : [...current, block];
    update({ copy_blocks: next });
  }

  // Summary badges for collapsed view
  const badges: Array<{ label: string; color: string }> = [];
  if (dna.angle) badges.push({ label: dna.angle, color: "text-violet-600 bg-violet-50 border-violet-200" });
  if (dna.style) badges.push({ label: dna.style, color: "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200" });
  if (dna.awareness_level) badges.push({ label: dna.awareness_level, color: "text-cyan-600 bg-cyan-50 border-cyan-200" });
  if (dna.concept_type) {
    const cat = CONCEPT_CATEGORIES.find(c => c.value === dna.concept_type);
    if (cat) badges.push({ label: cat.label, color: "text-amber-600 bg-amber-50 border-amber-200" });
  }
  if (dna.ad_source) badges.push({ label: dna.ad_source, color: "text-emerald-600 bg-emerald-50 border-emerald-200" });

  const hasDna = badges.length > 0 || dna.concept_description || (dna.hooks?.length ?? 0) > 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <Dna className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide shrink-0">CASH DNA</span>

        {/* Summary badges */}
        {!expanded && badges.length > 0 && (
          <div className="flex items-center gap-1 min-w-0 overflow-hidden ml-1">
            {badges.slice(0, 3).map(b => (
              <span key={b.label} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${b.color}`}>
                {b.label}
              </span>
            ))}
            {badges.length > 3 && (
              <span className="text-[10px] text-gray-400 shrink-0">+{badges.length - 3}</span>
            )}
          </div>
        )}
        {!expanded && !hasDna && (
          <span className="text-[10px] text-gray-400 italic">Not set</span>
        )}

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {/* AI Analyze button */}
          {hasAdCopy && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); handleAnalyze(); }}
              className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                analyzing
                  ? "text-violet-400 bg-violet-50 cursor-wait"
                  : "text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 cursor-pointer"
              }`}
            >
              {analyzing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {analyzing ? "Analyzing..." : "AI Analyze"}
            </span>
          )}
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3 py-3 space-y-3 bg-white">
          {/* Row 1: Concept Type, Angle, Style */}
          <div className="grid grid-cols-3 gap-2">
            <DnaSelect
              label="Concept Type"
              value={dna.concept_type}
              options={CONCEPT_CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
              onChange={(v) => update({ concept_type: v as ConceptCategory | null })}
            />
            <DnaSelect
              label="Angle"
              value={dna.angle}
              options={ANGLES.map(a => ({ value: a, label: a }))}
              onChange={(v) => update({ angle: v as Angle | null })}
            />
            <DnaSelect
              label="Style"
              value={dna.style}
              options={STYLES.map(s => ({ value: s, label: s }))}
              onChange={(v) => update({ style: v as Style | null })}
            />
          </div>

          {/* Row 2: Awareness Level, Ad Source */}
          <div className="grid grid-cols-3 gap-2">
            <DnaSelect
              label="Awareness Level"
              value={dna.awareness_level}
              options={AWARENESS_LEVELS.map(a => ({ value: a, label: a }))}
              onChange={(v) => update({ awareness_level: v as AwarenessLevel | null })}
            />
            <DnaSelect
              label="Ad Source"
              value={dna.ad_source}
              options={AD_SOURCES.map(s => ({ value: s, label: s }))}
              onChange={(v) => update({ ad_source: v as AdSource | null })}
            />
            <div /> {/* Spacer */}
          </div>

          {/* Row 3: Copy Blocks */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
              Copy Blocks
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COPY_BLOCKS.map(block => {
                const active = (dna.copy_blocks ?? []).includes(block);
                return (
                  <button
                    key={block}
                    onClick={() => toggleCopyBlock(block)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-indigo-50 text-indigo-700 border-indigo-300 font-medium"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {block}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 4: Concept Description */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
              Core Concept / Insight
            </label>
            <textarea
              value={dna.concept_description ?? ""}
              onChange={(e) => update({ concept_description: e.target.value })}
              placeholder="What is the core concept or insight this ad leverages?"
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-violet-300 focus:border-violet-300 placeholder:text-gray-300"
              rows={2}
            />
          </div>

          {/* Row 5: Hooks */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
              Hooks (one per line)
            </label>
            <textarea
              value={(dna.hooks ?? []).join("\n")}
              onChange={(e) => {
                const lines = e.target.value.split("\n");
                update({ hooks: lines });
              }}
              placeholder="The first 1-2 sentences that stop the scroll..."
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-violet-300 focus:border-violet-300 placeholder:text-gray-300"
              rows={3}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable DNA dropdown
function DnaSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 block">
        {label}
      </label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-xs text-gray-400">None</SelectItem>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
