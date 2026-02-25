import { PageQualityAnalysis } from "@/types";

export default function TranslationQualityPanel({
  analysis,
}: {
  analysis: PageQualityAnalysis;
}) {
  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
      <p className="text-xs text-gray-600">{analysis.overall_assessment}</p>
      {analysis.fluency_issues.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Fluency issues</p>
          <ul className="text-xs text-gray-500 space-y-0.5">
            {analysis.fluency_issues.map((issue, i) => (
              <li key={i}>- {issue}</li>
            ))}
          </ul>
        </div>
      )}
      {analysis.grammar_issues.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Grammar issues</p>
          <ul className="text-xs text-gray-500 space-y-0.5">
            {analysis.grammar_issues.map((issue, i) => (
              <li key={i}>- {issue}</li>
            ))}
          </ul>
        </div>
      )}
      {analysis.context_errors.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Context errors</p>
          <ul className="text-xs text-gray-500 space-y-0.5">
            {analysis.context_errors.map((issue, i) => (
              <li key={i}>- {issue}</li>
            ))}
          </ul>
        </div>
      )}
      {analysis.name_localization.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Unlocalized names</p>
          <ul className="text-xs text-gray-500 space-y-0.5">
            {analysis.name_localization.map((issue, i) => (
              <li key={i}>- {issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
