"use client";

import { useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type {
  ComplianceResult,
  ComplianceTextResult,
  ComplianceImageResult,
} from "@/types";

interface Props {
  jobId: string;
  complianceResult: ComplianceResult | null;
  onResultUpdate: (result: ComplianceResult) => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${diffHr}h ago`;
}

const verdictConfig = {
  PASS: {
    badge: ShieldCheck,
    badgeClass: "bg-green-100 text-green-700",
    label: "PASS",
  },
  WARNING: {
    badge: ShieldAlert,
    badgeClass: "bg-amber-100 text-amber-700",
    label: "WARNING",
  },
  REJECT: {
    badge: XCircle,
    badgeClass: "bg-red-100 text-red-700",
    label: "REJECT",
  },
};

function VerdictBadge({ verdict }: { verdict: "PASS" | "WARNING" | "REJECT" }) {
  const config = verdictConfig[verdict];
  const Icon = config.badge;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.badgeClass}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function TextResultCard({ result }: { result: ComplianceTextResult }) {
  const isPassing = result.verdict === "PASS";
  const bgClass = isPassing
    ? "bg-green-50 border-green-200"
    : result.verdict === "WARNING"
      ? "bg-amber-50 border-amber-200"
      : "bg-red-50 border-red-200";
  const iconClass = isPassing
    ? "text-green-600"
    : result.verdict === "WARNING"
      ? "text-amber-600"
      : "text-red-600";
  const Icon = isPassing
    ? CheckCircle2
    : result.verdict === "WARNING"
      ? AlertTriangle
      : XCircle;

  return (
    <div className={`border rounded-lg p-3 ${bgClass}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-gray-500 uppercase">
            {result.type}
          </span>
          <p className="text-sm text-gray-700 mt-0.5 break-words">
            &ldquo;{result.text.length > 120
              ? result.text.slice(0, 120) + "..."
              : result.text}&rdquo;
          </p>
          {result.issues.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {result.issues.map((issue, i) => (
                <div key={i} className="text-xs text-gray-600">
                  <span className="font-medium">{issue.rule}:</span>{" "}
                  {issue.detail}
                  {issue.suggestion && (
                    <div className="mt-0.5 text-gray-500 italic">
                      Suggestion: {issue.suggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageResultCard({ result }: { result: ComplianceImageResult }) {
  const isWarning = result.verdict === "WARNING";
  const bgClass = isWarning
    ? "bg-amber-50 border-amber-200"
    : "bg-red-50 border-red-200";
  const iconClass = isWarning ? "text-amber-600" : "text-red-600";
  const Icon = isWarning ? AlertTriangle : XCircle;

  return (
    <div className={`border rounded-lg p-3 ${bgClass}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          {result.issues.map((issue, i) => (
            <div key={i} className="text-xs text-gray-600">
              <span className="font-medium">{issue.rule}:</span> {issue.detail}
              {issue.suggestion && (
                <div className="mt-0.5 text-gray-500 italic">
                  Suggestion: {issue.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ComplianceCheck({
  jobId,
  complianceResult,
  onResultUpdate,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/image-jobs/${jobId}/compliance-check`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Check failed (${res.status})`);
      }
      const data = await res.json();
      onResultUpdate(data.result);
      if (data.cost != null) {
        setCost(data.cost);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compliance check failed");
    } finally {
      setLoading(false);
    }
  }

  const hasResult = complianceResult !== null;
  const allImagesPassed =
    hasResult &&
    complianceResult.image_results.every((r) => r.verdict === "PASS");
  const nonPassingImages = hasResult
    ? complianceResult.image_results.filter((r) => r.verdict !== "PASS")
    : [];

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-medium text-gray-900">
            Compliance Check
          </span>
          {hasResult && (
            <>
              <VerdictBadge verdict={complianceResult.overall_verdict} />
              <span className="text-xs text-gray-400">
                {timeAgo(complianceResult.checked_at)}
              </span>
            </>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Expandable body */}
      {expanded && (
        <div className="border-t border-gray-200 px-4 py-3 space-y-4">
          {/* Run / Re-run button */}
          <button
            onClick={runCheck}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking...
              </>
            ) : hasResult ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Re-run Check
              </>
            ) : (
              <>
                <Shield className="h-3.5 w-3.5" />
                Run Compliance Check
              </>
            )}
          </button>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Results */}
          {hasResult && !loading && (
            <div className="space-y-4">
              {/* Summary */}
              <p className="text-sm text-gray-700">{complianceResult.summary}</p>

              {/* Ad Copy section */}
              {complianceResult.text_results.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Ad Copy
                  </h4>
                  <div className="space-y-2">
                    {complianceResult.text_results.map((result, i) => (
                      <TextResultCard key={i} result={result} />
                    ))}
                  </div>
                </div>
              )}

              {/* Images section */}
              {complianceResult.image_results.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Images
                  </h4>
                  {allImagesPassed ? (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      All {complianceResult.image_results.length} images passed
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {nonPassingImages.map((result, i) => (
                        <ImageResultCard key={i} result={result} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cost display */}
              {cost != null && (
                <div className="text-xs text-gray-400 text-right">
                  Check cost: ${cost.toFixed(4)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
