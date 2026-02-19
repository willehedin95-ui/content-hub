"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Clock, Image as ImageIcon, ChevronRight, Trash2 } from "lucide-react";
import { ImageJob, Language, LANGUAGES, PRODUCTS, COUNTRY_MAP, MetaCampaignStatus } from "@/types";
import NewConceptModal from "@/components/images/NewConceptModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

function getLanguageStatus(job: ImageJob): Map<Language, "done" | "partial" | "none"> {
  const langCounts = new Map<Language, { total: number; completed: number }>();
  for (const si of job.source_images ?? []) {
    for (const t of si.image_translations ?? []) {
      const entry = langCounts.get(t.language) ?? { total: 0, completed: 0 };
      entry.total++;
      if (t.status === "completed") entry.completed++;
      langCounts.set(t.language, entry);
    }
  }
  const result = new Map<Language, "done" | "partial" | "none">();
  for (const lang of job.target_languages) {
    const counts = langCounts.get(lang);
    if (!counts || counts.total === 0) result.set(lang, "none");
    else if (counts.completed === counts.total) result.set(lang, "done");
    else result.set(lang, "partial");
  }
  return result;
}

function getMarketStatus(job: ImageJob): Map<string, MetaCampaignStatus> {
  const result = new Map<string, MetaCampaignStatus>();
  for (const d of job.deployments ?? []) {
    // If multiple deployments for same country, prefer "pushed" > "pushing" > "error" > "draft"
    const existing = result.get(d.country);
    if (!existing || d.status === "pushed" || (d.status === "pushing" && existing !== "pushed")) {
      result.set(d.country, d.status);
    }
  }
  return result;
}

function getOverallStatus(job: ImageJob): { label: string; color: string } {
  if (job.status === "draft") return { label: "Importing", color: "text-gray-500 bg-gray-100" };

  const hasDeployments = (job.deployments?.length ?? 0) > 0;
  const hasPushed = job.deployments?.some((d) => d.status === "pushed");

  if (hasPushed) return { label: "Published", color: "text-emerald-700 bg-emerald-50" };
  if (hasDeployments) return { label: "Pushing", color: "text-blue-700 bg-blue-50" };

  const completed = job.completed_translations ?? 0;
  const total = job.total_translations ?? 0;

  if (total > 0 && completed === total) return { label: "Translated", color: "text-indigo-700 bg-indigo-50" };
  if (completed > 0) return { label: "Translating", color: "text-amber-700 bg-amber-50" };
  if (job.status === "ready") return { label: "Ready", color: "text-gray-600 bg-gray-100" };

  return { label: "New", color: "text-gray-500 bg-gray-100" };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toLowerCase();
}

// All possible countries for the Markets column
const ALL_COUNTRIES = Object.values(COUNTRY_MAP);
const COUNTRY_FLAGS: Record<string, string> = {
  SE: "🇸🇪",
  NO: "🇳🇴",
  DK: "🇩🇰",
  DE: "🇩🇪",
};

export default function ImagesPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [avgSeconds, setAvgSeconds] = useState(75);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/image-jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch average generation time
  useEffect(() => {
    fetch("/api/image-jobs/progress")
      .then((res) => res.json())
      .then((data) => {
        if (data.avgSeconds) setAvgSeconds(data.avgSeconds);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Poll when any job is processing
  useEffect(() => {
    const hasProcessing = jobs.some((j) => j.status === "draft" || j.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  async function handleDelete(jobId: string) {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/image-jobs/${jobId}`, { method: "DELETE" });
    if (res.ok) setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  function handleCreated(jobId: string) {
    setShowModal(false);
    router.push(`/images/${jobId}`);
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Concepts</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Concept
        </button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-gray-400 mb-6">
        <Clock className="w-3.5 h-3.5" />
        Current average: ~{avgSeconds}s per image
      </p>

      {/* Table */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
                <div className="h-4 w-8 bg-gray-200 rounded" />
                <div className="h-4 w-40 bg-gray-200 rounded" />
                <div className="h-4 w-16 bg-gray-100 rounded" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ImageIcon className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No concepts yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Click &quot;+ New Concept&quot; to create your first batch
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[48px_1fr_72px_120px_120px_96px_72px_40px] items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div>#</div>
            <div>Name</div>
            <div>Product</div>
            <div>Translations</div>
            <div>Markets</div>
            <div>Status</div>
            <div>Created</div>
            <div></div>
          </div>

          {/* Table rows */}
          {jobs.map((job) => {
            const langStatus = getLanguageStatus(job);
            const marketStatus = getMarketStatus(job);
            const status = getOverallStatus(job);
            const conceptNum = job.concept_number;

            return (
              <Link
                key={job.id}
                href={`/images/${job.id}`}
                className="grid grid-cols-[48px_1fr_72px_120px_120px_96px_72px_40px] items-center gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors group"
              >
                {/* # */}
                <span className="text-xs font-mono text-gray-400">
                  {conceptNum ? String(conceptNum).padStart(3, "0") : "—"}
                </span>

                {/* Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate">{job.name}</span>
                </div>

                {/* Product */}
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full text-center truncate">
                  {job.product ? (PRODUCTS.find((p) => p.value === job.product)?.label ?? job.product) : "—"}
                </span>

                {/* Translations (language flags with status dots) */}
                <div className="flex items-center gap-1.5">
                  {job.target_languages.map((lang) => {
                    const langInfo = LANGUAGES.find((l) => l.value === lang);
                    const s = langStatus.get(lang) ?? "none";
                    return (
                      <span key={lang} className="relative inline-flex items-center" title={`${langInfo?.label}: ${s === "done" ? "translated" : s === "partial" ? "in progress" : "not started"}`}>
                        <span className="text-sm">{langInfo?.flag}</span>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                          s === "done" ? "bg-emerald-500" : s === "partial" ? "bg-amber-400" : "bg-gray-300"
                        }`} />
                      </span>
                    );
                  })}
                </div>

                {/* Markets (deployment status per country) */}
                <div className="flex items-center gap-1.5">
                  {job.target_languages.map((lang) => {
                    const country = COUNTRY_MAP[lang];
                    const depStatus = marketStatus.get(country);
                    return (
                      <span key={country} className="relative inline-flex items-center" title={`${country}: ${depStatus === "pushed" ? "published" : depStatus === "pushing" ? "pushing" : depStatus === "error" ? "error" : "not deployed"}`}>
                        <span className={`text-sm ${!depStatus ? "opacity-30" : ""}`}>{COUNTRY_FLAGS[country]}</span>
                        {depStatus && (
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                            depStatus === "pushed" ? "bg-emerald-500" : depStatus === "pushing" ? "bg-blue-500" : depStatus === "error" ? "bg-red-500" : "bg-gray-300"
                          }`} />
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Status badge */}
                <span className={`text-xs font-medium px-2 py-1 rounded-full text-center ${status.color}`}>
                  {status.label}
                </span>

                {/* Created */}
                <span className="text-xs text-gray-400">{formatDate(job.created_at)}</span>

                {/* Actions */}
                <div className="flex items-center justify-end">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(job.id); }}
                    className="text-gray-300 hover:text-red-500 p-1 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <NewConceptModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
        avgSecondsPerImage={avgSeconds}
      />

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete concept"
        message="Delete this concept and all its translations?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
