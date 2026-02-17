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
    ? "text-indigo-600"
    : hasFailed
    ? "text-yellow-600"
    : "text-emerald-600";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Status icon */}
        <StatusIcon
          className={`w-5 h-5 shrink-0 ${statusColor} ${isProcessing ? "animate-spin" : ""}`}
        />

        {/* Info */}
        <Link href={`/images/${job.id}`} className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{job.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Language flags */}
            <span className="text-sm">
              {job.target_languages
                .map((l) => LANGUAGES.find((lang) => lang.value === l)?.flag)
                .filter(Boolean)
                .join(" ")}
            </span>
            <span className="text-xs text-gray-400">
              {job.total_images ?? 0} images &middot; {completed}/{total} ready
            </span>
            {hasFailed && (
              <span className="text-xs text-yellow-600">&middot; {failed} need attention</span>
            )}
          </div>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasFailed && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(job.id); }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 rounded-lg px-3 py-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
          {completed > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onExport(job.id); }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 rounded-lg px-3 py-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}
            className="text-gray-400 hover:text-red-600 p-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <Link href={`/images/${job.id}`} className="text-gray-400 hover:text-gray-700 p-2 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
