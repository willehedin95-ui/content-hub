"use client";

import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Trash2,
  ChevronRight,
  Download,
} from "lucide-react";
import { ImageJob, LANGUAGES } from "@/types";

interface Props {
  job: ImageJob;
  onRetry: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onExport: (jobId: string) => void;
}

export default function ImageJobCard({ job, onRetry, onDelete, onExport }: Props) {
  const total = job.total_translations ?? 0;
  const completed = job.completed_translations ?? 0;
  const failed = job.failed_translations ?? 0;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const isProcessing = job.status === "processing" || (total > 0 && completed + failed < total);
  const hasFailed = failed > 0;

  const StatusIcon = isProcessing
    ? Loader2
    : hasFailed
    ? AlertTriangle
    : CheckCircle2;

  const statusColor = isProcessing
    ? "text-indigo-400"
    : hasFailed
    ? "text-yellow-400"
    : "text-emerald-400";

  return (
    <div className="bg-[#141620] border border-[#1e2130] rounded-xl p-4 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-4">
        {/* Status icon */}
        <StatusIcon
          className={`w-5 h-5 shrink-0 ${statusColor} ${isProcessing ? "animate-spin" : ""}`}
        />

        {/* Info */}
        <Link href={`/images/${job.id}`} className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{job.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Language flags */}
            <span className="text-sm">
              {job.target_languages
                .map((l) => LANGUAGES.find((lang) => lang.value === l)?.flag)
                .filter(Boolean)
                .join(" ")}
            </span>
            <span className="text-xs text-slate-500">
              {job.total_images ?? 0} images &middot; {completed}/{total} ready
            </span>
            {hasFailed && (
              <span className="text-xs text-yellow-400">&middot; {failed} need attention</span>
            )}
          </div>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasFailed && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(job.id); }}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 border border-[#1e2130] hover:border-indigo-500/30 rounded-lg px-3 py-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
          {completed > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onExport(job.id); }}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 border border-[#1e2130] hover:border-indigo-500/30 rounded-lg px-3 py-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}
            className="text-slate-600 hover:text-red-400 p-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <Link href={`/images/${job.id}`} className="text-slate-600 hover:text-slate-300 p-2 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-[#1e2130] rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
