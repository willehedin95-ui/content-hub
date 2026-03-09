"use client";

import { useBuilder } from "./BuilderContext";
import { Loader2, RefreshCw, X, CheckCircle2, AlertTriangle } from "lucide-react";

export default function QualityPanel() {
  const {
    qualityScore,
    qualityAnalysis,
    showQualityDetails,
    setShowQualityDetails,
    analyzing,
    runQualityAnalysis,
    handleFixQuality,
    fixingQuality,
    saving,
    retranslating,
    iframeRef,
    markDirty,
    pushUndoSnapshot,
  } = useBuilder();

  if (!showQualityDetails || !qualityAnalysis) return null;

  const scoreColor =
    (qualityScore ?? 0) >= 85
      ? "text-emerald-700"
      : (qualityScore ?? 0) >= 60
        ? "text-amber-700"
        : "text-red-700";

  const scoreBg =
    (qualityScore ?? 0) >= 85
      ? "bg-emerald-50"
      : (qualityScore ?? 0) >= 60
        ? "bg-amber-50"
        : "bg-red-50";

  function applyCorrection(find: string, replace: string) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;

    pushUndoSnapshot();

    // Walk text nodes and apply replacement
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let applied = false;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent && node.textContent.includes(find)) {
        node.textContent = node.textContent.replace(find, replace);
        applied = true;
      }
    }

    if (applied) {
      markDirty();
    }
  }

  const hasFluency = qualityAnalysis.fluency_issues?.length > 0;
  const hasGrammar = qualityAnalysis.grammar_issues?.length > 0;
  const hasContext = qualityAnalysis.context_errors?.length > 0;
  const hasNames = qualityAnalysis.name_localization?.length > 0;
  const hasCorrections = (qualityAnalysis.suggested_corrections?.length ?? 0) > 0;
  const hasAnyIssues = hasFluency || hasGrammar || hasContext || hasNames;

  return (
    <div className="bg-gray-50 border-b border-gray-200 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-bold px-2 py-0.5 rounded-full ${scoreBg} ${scoreColor}`}
          >
            {qualityScore}
          </span>
          <span className="text-xs font-medium text-gray-700">
            Quality Analysis
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runQualityAnalysis()}
            disabled={analyzing || fixingQuality}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {analyzing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {analyzing ? "Analyzing..." : "Re-analyze"}
          </button>
          <button
            onClick={handleFixQuality}
            disabled={fixingQuality || retranslating || saving || analyzing}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            {fixingQuality ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {fixingQuality ? "Fixing..." : "Auto-fix"}
          </button>
          <button
            onClick={() => setShowQualityDetails(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Overall assessment */}
      <div className="px-4 py-2">
        <p className="text-xs text-gray-600 leading-relaxed">
          {qualityAnalysis.overall_assessment}
        </p>
      </div>

      {/* Issues */}
      {hasAnyIssues && (
        <div className="px-4 pb-2 space-y-2">
          {hasFluency && (
            <IssueSection
              title="Fluency Issues"
              issues={qualityAnalysis.fluency_issues}
              color="amber"
            />
          )}
          {hasGrammar && (
            <IssueSection
              title="Grammar Issues"
              issues={qualityAnalysis.grammar_issues}
              color="red"
            />
          )}
          {hasContext && (
            <IssueSection
              title="Context Errors"
              issues={qualityAnalysis.context_errors}
              color="red"
            />
          )}
          {hasNames && (
            <IssueSection
              title="Name Localization"
              issues={qualityAnalysis.name_localization}
              color="blue"
            />
          )}
        </div>
      )}

      {/* Suggested corrections */}
      {hasCorrections && (
        <div className="px-4 pb-3">
          <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">
            Suggested Corrections
          </span>
          <div className="mt-1 space-y-1">
            {qualityAnalysis.suggested_corrections!.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-white rounded border border-gray-100 px-2 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 line-through truncate">
                    {c.find}
                  </p>
                  <p className="text-xs text-gray-900 truncate">{c.replace}</p>
                </div>
                <button
                  onClick={() => applyCorrection(c.find, c.replace)}
                  className="shrink-0 text-[10px] font-medium text-emerald-600 hover:text-emerald-700 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 transition-colors"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No issues */}
      {!hasAnyIssues && !hasCorrections && (
        <div className="px-4 pb-3 flex items-center gap-2 text-xs text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          No issues found
        </div>
      )}
    </div>
  );
}

function IssueSection({
  title,
  issues,
  color,
}: {
  title: string;
  issues: string[];
  color: "amber" | "red" | "blue";
}) {
  const colorMap = {
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    red: "text-red-700 bg-red-50 border-red-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
  };
  const iconColor = {
    amber: "text-amber-500",
    red: "text-red-500",
    blue: "text-blue-500",
  };

  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">
        {title}
      </span>
      <ul className="mt-0.5 space-y-0.5">
        {issues.map((issue, i) => (
          <li
            key={i}
            className={`flex items-start gap-1.5 text-xs rounded px-2 py-1 border ${colorMap[color]}`}
          >
            <AlertTriangle className={`w-3 h-3 shrink-0 mt-0.5 ${iconColor[color]}`} />
            <span>{issue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
