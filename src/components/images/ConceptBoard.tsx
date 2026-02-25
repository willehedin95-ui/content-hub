"use client";

import Link from "next/link";
import { ImageJob, LANGUAGES, PRODUCTS, COUNTRY_MAP } from "@/types";
import { TagBadge } from "@/components/ui/tag-input";
import { getLanguageStatus, getMarketStatus, COUNTRY_FLAGS, type WizardStep } from "@/lib/concept-status";

interface ConceptBoardProps {
  jobs: ImageJob[];
  getWizardStep: (job: ImageJob) => WizardStep;
}

const COLUMNS = [
  { step: 0, title: "New", accent: "border-gray-300", bg: "bg-gray-50", badge: "bg-gray-200 text-gray-600" },
  { step: 1, title: "Images", accent: "border-amber-400", bg: "bg-amber-50/40", badge: "bg-amber-100 text-amber-700" },
  { step: 2, title: "Ad Copy", accent: "border-indigo-400", bg: "bg-indigo-50/40", badge: "bg-indigo-100 text-indigo-700" },
  { step: 3, title: "Preview & Push", accent: "border-emerald-400", bg: "bg-emerald-50/40", badge: "bg-emerald-100 text-emerald-700" },
];

function daysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export default function ConceptBoard({ jobs, getWizardStep }: ConceptBoardProps) {
  const grouped = new Map<number, ImageJob[]>();
  for (const col of COLUMNS) grouped.set(col.step, []);
  for (const job of jobs) {
    const ws = getWizardStep(job);
    const list = grouped.get(ws.step) ?? [];
    list.push(job);
    grouped.set(ws.step, list);
  }

  return (
    <div className="grid grid-cols-4 gap-4 min-h-[400px]">
      {COLUMNS.map((col) => {
        const colJobs = grouped.get(col.step) ?? [];
        return (
          <div key={col.step} className={`rounded-xl border-t-2 ${col.accent} ${col.bg} p-3`}>
            {/* Column header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {col.title}
              </h3>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${col.badge}`}>
                {colJobs.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-2">
              {colJobs.map((job) => {
                const langStatus = getLanguageStatus(job);
                const marketStatus = getMarketStatus(job);
                const ws = getWizardStep(job);
                const conceptNum = job.concept_number;

                return (
                  <Link
                    key={job.id}
                    href={`/images/${job.id}`}
                    className="block bg-white rounded-lg border border-gray-200 p-3 hover:border-indigo-300 hover:shadow-sm transition-all group"
                  >
                    {/* Top row: number + status */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono text-gray-400">
                        {conceptNum ? `#${String(conceptNum).padStart(3, "0")}` : ""}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ws.color}`}>
                        {ws.label.replace(/Step \d\/\d · /, "")}
                      </span>
                    </div>

                    {/* Name */}
                    <p className="text-sm font-medium text-gray-800 truncate mb-2">
                      {job.name}
                    </p>

                    {/* Product + languages */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full truncate max-w-[80px]">
                        {job.product ? (PRODUCTS.find((p) => p.value === job.product)?.label ?? job.product) : "—"}
                      </span>
                      <div className="flex items-center gap-1">
                        {job.target_languages.map((lang) => {
                          const langInfo = LANGUAGES.find((l) => l.value === lang);
                          const status = langStatus.get(lang)?.status ?? "none";
                          return (
                            <span key={lang} className="relative inline-flex items-center">
                              <span className="text-xs" role="img" aria-label={langInfo?.label ?? lang}>{langInfo?.flag}</span>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-white ${
                                status === "done" ? "bg-emerald-500" : status === "partial" ? "bg-amber-400" : "bg-gray-300"
                              }`} />
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Markets row (only show if any deployments) */}
                    {marketStatus.size > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400 mr-1">Markets</span>
                        {job.target_languages.map((lang) => {
                          const country = COUNTRY_MAP[lang];
                          const depStatus = marketStatus.get(country);
                          if (!depStatus) return null;
                          return (
                            <span key={country} className="relative inline-flex items-center">
                              <span className="text-xs" role="img" aria-label={country}>{COUNTRY_FLAGS[country]}</span>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-white ${
                                depStatus === "pushed" ? "bg-emerald-500" : depStatus === "pushing" ? "bg-blue-500" : depStatus === "error" ? "bg-red-500" : "bg-gray-300"
                              }`} />
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Tags + age */}
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100">
                      <div className="flex items-center gap-1 min-w-0">
                        {(job.tags ?? []).slice(0, 2).map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                        {(job.tags ?? []).length > 2 && (
                          <span className="text-[10px] text-gray-400">+{(job.tags ?? []).length - 2}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {daysAgo(job.created_at)}
                      </span>
                    </div>

                    {/* Progress bar for images step */}
                    {col.step === 1 && (job.total_translations ?? 0) > 0 && (
                      <div className="mt-2">
                        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all"
                            style={{ width: `${((job.completed_translations ?? 0) / (job.total_translations ?? 1)) * 100}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {job.completed_translations ?? 0}/{job.total_translations ?? 0} images
                        </p>
                      </div>
                    )}
                  </Link>
                );
              })}

              {colJobs.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">
                  No concepts
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
