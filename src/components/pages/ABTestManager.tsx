"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Upload,
  Loader2,
  AlertCircle,
  Trophy,
  Trash2,
  FlaskConical,
  CheckCircle2,
  Eye,
  MousePointerClick,
  TrendingUp,
} from "lucide-react";
import { ABTest, Translation, LANGUAGES } from "@/types";

interface Stats {
  control: { views: number; clicks: number; ctr: number };
  variant: { views: number; clicks: number; ctr: number };
}

interface Props {
  pageId: string;
  pageName: string;
  language: (typeof LANGUAGES)[number];
  abTest: ABTest;
  control: Translation;
  variant: Translation;
}

export default function ABTestManager({
  pageId,
  pageName,
  language,
  abTest,
  control,
  variant,
}: Props) {
  const router = useRouter();
  const [split, setSplit] = useState(abTest.split);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [declaringWinner, setDeclaringWinner] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);

  const isActive = abTest.status === "active";
  const isCompleted = abTest.status === "completed";
  const isDraft = abTest.status === "draft";

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/ab-tests/${abTest.id}/stats`);
    if (res.ok) {
      setStats(await res.json());
    }
  }, [abTest.id]);

  // Fetch stats on mount and poll every 30s while active
  useEffect(() => {
    if (!isActive && !isCompleted) return;
    fetchStats();
    if (!isActive) return;
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [isActive, isCompleted, fetchStats]);

  async function handleSaveSplit() {
    setSaving(true);
    setError("");

    const res = await fetch(`/api/ab-tests/${abTest.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ split }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save");
      return;
    }

    router.refresh();
  }

  async function handlePublish() {
    setPublishing(true);
    setError("");

    const res = await fetch(`/api/ab-tests/${abTest.id}/publish`, {
      method: "POST",
    });

    setPublishing(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Publish failed");
      return;
    }

    router.refresh();
  }

  async function handleDeclareWinner(winner: "control" | "b") {
    const label = winner === "control" ? "Control (A)" : "Variant B";
    if (!confirm(`Declare "${label}" as the winner? This will deploy it to the main URL and end the test.`)) {
      return;
    }

    setDeclaringWinner(true);
    setError("");

    const res = await fetch(`/api/ab-tests/${abTest.id}/winner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner }),
    });

    setDeclaringWinner(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to declare winner");
      return;
    }

    router.push(`/pages/${pageId}`);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this A/B test? The variant B translation will also be deleted.")) {
      return;
    }

    setDeleting(true);
    setError("");

    const res = await fetch(`/api/ab-tests/${abTest.id}`, {
      method: "DELETE",
    });

    setDeleting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to delete");
      return;
    }

    router.push(`/pages/${pageId}`);
    router.refresh();
  }

  function StatCard({
    label,
    icon: Icon,
    controlVal,
    variantVal,
    suffix,
    highlight,
  }: {
    label: string;
    icon: typeof Eye;
    controlVal: number;
    variantVal: number;
    suffix?: string;
    highlight?: boolean;
  }) {
    const controlWins = highlight && controlVal > variantVal;
    const variantWins = highlight && variantVal > controlVal;
    return (
      <div className="bg-[#141620] border border-[#1e2130] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {label}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Control (A)</p>
            <p className={`text-lg font-bold ${controlWins ? "text-emerald-400" : "text-slate-200"}`}>
              {controlVal.toLocaleString()}{suffix}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Variant B</p>
            <p className={`text-lg font-bold ${variantWins ? "text-emerald-400" : "text-slate-200"}`}>
              {variantVal.toLocaleString()}{suffix}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Back */}
      <Link
        href={`/pages/${pageId}`}
        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {pageName}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-bold text-white">A/B Test</h1>
            <span className="text-lg">{language.flag}</span>
            <span className="text-slate-400 text-lg">{language.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                isActive
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/20"
                  : isCompleted
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                  : "bg-slate-700/50 text-slate-400 border border-slate-600/30"
              }`}
            >
              {isActive ? "Active" : isCompleted ? "Completed" : "Draft"}
            </span>
            {abTest.winner && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" />
                Winner: {abTest.winner === "control" ? "Control (A)" : "Variant B"}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg px-3 py-2 transition-colors"
        >
          {deleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Delete Test
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stats panel */}
      {stats && (isActive || isCompleted) && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Page Views"
            icon={Eye}
            controlVal={stats.control.views}
            variantVal={stats.variant.views}
          />
          <StatCard
            label="Outbound Clicks"
            icon={MousePointerClick}
            controlVal={stats.control.clicks}
            variantVal={stats.variant.clicks}
          />
          <StatCard
            label="Click-Through Rate"
            icon={TrendingUp}
            controlVal={stats.control.ctr}
            variantVal={stats.variant.ctr}
            suffix="%"
            highlight
          />
        </div>
      )}

      {/* Split slider */}
      {!isCompleted && (
        <div className="bg-[#141620] border border-[#1e2130] rounded-xl p-6 mb-6">
          <p className="text-sm font-medium text-slate-300 mb-4">Traffic Split</p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 w-24 text-right">
              Control (A): {split}%
            </span>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
            <span className="text-xs text-slate-400 w-24">
              Variant B: {100 - split}%
            </span>
          </div>
          {split !== abTest.split && (
            <div className="flex justify-end mt-3">
              <button
                onClick={handleSaveSplit}
                disabled={saving}
                className="flex items-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save Split
              </button>
            </div>
          )}
        </div>
      )}

      {/* Side-by-side previews */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Control (A) */}
        <div className="bg-[#141620] border border-[#1e2130] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2130]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300 bg-slate-700/50 px-2 py-0.5 rounded">A</span>
              <span className="text-sm font-medium text-slate-300">Control</span>
              {abTest.winner === "control" && (
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
            <Link
              href={`/pages/${pageId}/edit/${language.value}`}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Link>
          </div>
          <div className="h-[500px]">
            <iframe
              src={`/api/preview/${control.id}`}
              className="w-full h-full bg-white"
              title="Control variant preview"
            />
          </div>
        </div>

        {/* Variant B */}
        <div className="bg-[#141620] border border-[#1e2130] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2130]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded">B</span>
              <span className="text-sm font-medium text-slate-300">Variant</span>
              {abTest.winner === "b" && (
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
            <Link
              href={`/pages/${pageId}/edit/${language.value}?variant=b`}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Link>
          </div>
          <div className="h-[500px]">
            <iframe
              src={`/api/preview/${variant.id}`}
              className="w-full h-full bg-white"
              title="Variant B preview"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {isDraft && (
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {publishing ? "Publishing…" : "Publish A/B Test"}
          </button>
        )}

        {isActive && (
          <>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex items-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-sm font-medium px-4 py-2.5 rounded-lg border border-amber-500/20 transition-colors"
            >
              {publishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {publishing ? "Republishing…" : "Republish"}
            </button>

            <button
              onClick={() => handleDeclareWinner("control")}
              disabled={declaringWinner}
              className="flex items-center gap-1.5 bg-slate-700/40 hover:bg-slate-700/70 text-slate-200 text-sm font-medium px-4 py-2.5 rounded-lg border border-slate-600/30 transition-colors"
            >
              {declaringWinner ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trophy className="w-4 h-4" />
              )}
              Winner: Control (A)
            </button>

            <button
              onClick={() => handleDeclareWinner("b")}
              disabled={declaringWinner}
              className="flex items-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-sm font-medium px-4 py-2.5 rounded-lg border border-amber-500/20 transition-colors"
            >
              {declaringWinner ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trophy className="w-4 h-4" />
              )}
              Winner: Variant B
            </button>
          </>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Test completed — {abTest.winner === "control" ? "Control (A)" : "Variant B"} won
          </div>
        )}
      </div>

      {/* Published URLs */}
      {(isActive || isCompleted) && abTest.router_url && (
        <div className="mt-6 bg-[#141620] border border-[#1e2130] rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Published URLs
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-500 w-20">Router:</span>
              <a
                href={abTest.router_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {abTest.router_url}
              </a>
            </div>
            {control.published_url && (
              <div className="flex items-center gap-3">
                <span className="text-slate-500 w-20">Control (A):</span>
                <a
                  href={control.published_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {control.published_url}
                </a>
              </div>
            )}
            {variant.published_url && (
              <div className="flex items-center gap-3">
                <span className="text-slate-500 w-20">Variant B:</span>
                <a
                  href={variant.published_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {variant.published_url}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
