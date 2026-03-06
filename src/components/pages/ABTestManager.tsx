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
  ShoppingCart,
  DollarSign,
  Percent,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { ABTest, Translation, LANGUAGES } from "@/types";
import { calculateSignificance } from "@/lib/ab-stats";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface VariantStats {
  views: number;
  clicks: number;
  ctr: number;
  conversions: number;
  revenue: number;
  cvr: number;
  revenuePerVisitor: number;
}

interface Stats {
  control: VariantStats;
  variant: VariantStats;
}

type TranslationWithPage = Translation & {
  pages: { id: string; name: string; slug: string };
};

interface Props {
  testName: string;
  testSlug: string;
  language: (typeof LANGUAGES)[number];
  abTest: ABTest;
  control: TranslationWithPage;
  variant: TranslationWithPage;
}

export default function ABTestManager({
  testName,
  testSlug,
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
  const [confirmWinner, setConfirmWinner] = useState<"control" | "b" | null>(null);
  const [confirmDeleteTest, setConfirmDeleteTest] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isActive = abTest.status === "active";
  const isCompleted = abTest.status === "completed";
  const isDraft = abTest.status === "draft";

  const daysRunning = Math.floor(
    (Date.now() - new Date(abTest.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  const significance = stats
    ? calculateSignificance(stats.control.views, stats.control.clicks, stats.variant.views, stats.variant.clicks)
    : null;

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/ab-tests/${abTest.id}/stats`);
      if (res.ok) {
        setStats(await res.json());
      }
    } catch {
      // Stats fetch is non-critical
    }
  }, [abTest.id]);

  const syncConversions = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/ab-tests/${abTest.id}/sync-conversions`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchStats();
      }
    } catch {
      // Non-critical
    } finally {
      setSyncing(false);
    }
  }, [abTest.id, fetchStats]);

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
    try {
      const res = await fetch(`/api/ab-tests/${abTest.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ split }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError("");
    try {
      const res = await fetch(`/api/ab-tests/${abTest.id}/publish`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Publish failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  async function handleDeclareWinner(winner: "control" | "b") {
    setConfirmWinner(null);
    setDeclaringWinner(true);
    setError("");
    try {
      const res = await fetch(`/api/ab-tests/${abTest.id}/winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to declare winner");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to declare winner");
    } finally {
      setDeclaringWinner(false);
    }
  }

  async function handleDelete() {
    setConfirmDeleteTest(false);
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/ab-tests/${abTest.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete");
        return;
      }
      router.push("/ab-tests");
      router.refresh();
    } catch {
      setError("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  function StatCard({
    label,
    icon: Icon,
    controlVal,
    variantVal,
    prefix,
    suffix,
    highlight,
  }: {
    label: string;
    icon: typeof Eye;
    controlVal: number;
    variantVal: number;
    prefix?: string;
    suffix?: string;
    highlight?: boolean;
  }) {
    const controlWins = highlight && controlVal > variantVal;
    const variantWins = highlight && variantVal > controlVal;
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Variant A</p>
            <p className={`text-lg font-bold ${controlWins ? "text-emerald-600" : "text-gray-800"}`}>
              {prefix}{controlVal.toLocaleString()}{suffix}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Variant B</p>
            <p className={`text-lg font-bold ${variantWins ? "text-emerald-600" : "text-gray-800"}`}>
              {prefix}{variantVal.toLocaleString()}{suffix}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      <Link
        href="/ab-tests"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        A/B Tests
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6 text-amber-600" />
            <h1 className="text-2xl font-bold text-gray-900">{testName}</h1>
            <span className="text-lg" role="img" aria-label={language.label}>{language.flag}</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                isActive
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : isCompleted
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-gray-100 text-gray-500 border border-gray-300"
              }`}
            >
              {isActive ? "Active" : isCompleted ? "Completed" : "Draft"}
            </span>
            <span className="text-xs text-gray-400">/{testSlug}</span>
            {(isActive || isCompleted) && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(abTest.created_at).toLocaleDateString("sv-SE")}
                {" "}
                <span className="text-gray-300">|</span>
                {" "}
                {daysRunning === 0 ? "Today" : `${daysRunning}d`}
              </span>
            )}
            {abTest.winner && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" />
                Winner: {abTest.winner === "control" ? "Variant A" : "Variant B"}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => setConfirmDeleteTest(true)}
          disabled={deleting}
          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-3 py-2 transition-colors"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Delete Test
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {stats && (isActive || isCompleted) && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <StatCard label="Page Views" icon={Eye} controlVal={stats.control.views} variantVal={stats.variant.views} />
            <StatCard label="Outbound Clicks" icon={MousePointerClick} controlVal={stats.control.clicks} variantVal={stats.variant.clicks} />
            <StatCard label="Click-Through Rate" icon={TrendingUp} controlVal={stats.control.ctr} variantVal={stats.variant.ctr} suffix="%" highlight />
          </div>

          {(stats.control.conversions > 0 || stats.variant.conversions > 0) && (
            <div className="grid grid-cols-4 gap-4 mb-4">
              <StatCard label="Conversions" icon={ShoppingCart} controlVal={stats.control.conversions} variantVal={stats.variant.conversions} highlight />
              <StatCard label="Revenue" icon={DollarSign} controlVal={stats.control.revenue} variantVal={stats.variant.revenue} prefix="kr " highlight />
              <StatCard label="Conversion Rate" icon={Percent} controlVal={stats.control.cvr} variantVal={stats.variant.cvr} suffix="%" highlight />
              <StatCard label="Rev / Visitor" icon={TrendingUp} controlVal={stats.control.revenuePerVisitor} variantVal={stats.variant.revenuePerVisitor} prefix="kr " highlight />
            </div>
          )}

          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={syncConversions}
              disabled={syncing}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {syncing ? "Syncing..." : "Sync Shopify conversions"}
            </button>
            {stats.control.conversions === 0 && stats.variant.conversions === 0 && (
              <span className="text-xs text-gray-400">No conversions synced yet</span>
            )}
          </div>
        </>
      )}

      {significance && (isActive || isCompleted) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Statistical Significance</span>
          </div>

          {!significance.hasEnoughData ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Not enough data yet. Need at least 30 views per variant.</p>
              <p className="text-xs text-gray-400">
                Recommended: ~{significance.minSampleSize.toLocaleString()} views per variant for reliable results.
              </p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Progress toward minimum sample</span>
                  <span>{Math.round(Math.min(((stats!.control.views + stats!.variant.views) / 2) / Math.max(significance.minSampleSize, 1), 1) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full transition-all"
                    style={{ width: `${Math.min(((stats!.control.views + stats!.variant.views) / 2) / Math.max(significance.minSampleSize, 1) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {significance.significant ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Statistically Significant
                  </span>
                ) : (
                  <span className="text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200 px-2.5 py-1 rounded-full">
                    Not Yet Significant
                  </span>
                )}
                <span className="text-xs text-gray-400">p = {significance.pValue.toFixed(4)}</span>
              </div>

              {significance.significant ? (
                <p className="text-sm text-gray-700">
                  {significance.confidenceLevel}% confident that{" "}
                  <span className="font-medium">
                    {significance.winner === "variant" ? "Variant B" : "Variant A"}
                  </span>{" "}
                  performs better.
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  No significant difference detected yet. Recommended: ~{significance.minSampleSize.toLocaleString()} views per variant.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!isCompleted && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-4">Traffic Split</p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 w-24 text-right">Variant A: {split}%</span>
            <input
              type="range" min={10} max={90} step={5} value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="flex-1 accent-amber-500"
              aria-label="Traffic split percentage"
              aria-valuetext={`A ${split}%, B ${100 - split}%`}
            />
            <span className="text-xs text-gray-500 w-24">Variant B: {100 - split}%</span>
          </div>
          {split !== abTest.split && (
            <div className="flex justify-end mt-3">
              <button
                onClick={handleSaveSplit}
                disabled={saving}
                className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-200 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save Split
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">A</span>
              <span className="text-sm font-medium text-gray-700 truncate">{control.pages.name}</span>
              {abTest.winner === "control" && <Trophy className="w-3.5 h-3.5 text-amber-600" />}
            </div>
            <Link
              href={`/pages/${control.pages.id}/edit/${language.value}`}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Link>
          </div>
          <div className="h-[500px]">
            <iframe src={`/api/preview/${control.id}`} className="w-full h-full bg-white" title="Variant A preview" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">B</span>
              <span className="text-sm font-medium text-gray-700 truncate">{variant.pages.name}</span>
              {abTest.winner === "b" && <Trophy className="w-3.5 h-3.5 text-amber-600" />}
            </div>
            <Link
              href={`/pages/${variant.pages.id}/edit/${language.value}`}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Link>
          </div>
          <div className="h-[500px]">
            <iframe src={`/api/preview/${variant.id}`} className="w-full h-full bg-white" title="Variant B preview" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isDraft && (
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {publishing ? "Publishing..." : "Publish A/B Test"}
          </button>
        )}

        {isActive && (
          <>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium px-4 py-2.5 rounded-lg border border-amber-200 transition-colors"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {publishing ? "Republishing..." : "Republish"}
            </button>

            <button
              onClick={() => setConfirmWinner("control")}
              disabled={declaringWinner}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium px-4 py-2.5 rounded-lg border border-gray-300 transition-colors"
            >
              {declaringWinner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              Winner: A
            </button>

            <button
              onClick={() => setConfirmWinner("b")}
              disabled={declaringWinner}
              className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium px-4 py-2.5 rounded-lg border border-amber-200 transition-colors"
            >
              {declaringWinner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              Winner: B
            </button>
          </>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-emerald-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Test completed — {abTest.winner === "control" ? "Variant A" : "Variant B"} won
          </div>
        )}
      </div>

      {(isActive || isCompleted) && abTest.router_url && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Published URLs</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-gray-400 w-20">Router:</span>
              <a href={abTest.router_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 transition-colors">
                {abTest.router_url}
              </a>
            </div>
            {control.published_url && (
              <div className="flex items-center gap-3">
                <span className="text-gray-400 w-20">Variant A:</span>
                <a href={control.published_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 transition-colors">
                  {control.published_url}
                </a>
              </div>
            )}
            {variant.published_url && (
              <div className="flex items-center gap-3">
                <span className="text-gray-400 w-20">Variant B:</span>
                <a href={variant.published_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 transition-colors">
                  {variant.published_url}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmWinner}
        title="Declare winner"
        message={`Declare "${confirmWinner === "control" ? "Variant A" : "Variant B"}" as the winner? This will deploy it to the main URL and end the test.`}
        confirmLabel="Declare Winner"
        variant="warning"
        onConfirm={() => confirmWinner && handleDeclareWinner(confirmWinner)}
        onCancel={() => setConfirmWinner(null)}
      />

      <ConfirmDialog
        open={confirmDeleteTest}
        title="Delete A/B test"
        message="Delete this A/B test? The source pages will not be affected."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteTest(false)}
      />
    </div>
  );
}
