import { PageQualityAnalysis } from "@/types";

export default function TranslationQualityPanel({
  analysis,
}: {
  analysis: PageQualityAnalysis;
}) {
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <p className="text-xs text-gray-600">{analysis.overall_assessment}</p>
    </div>
  );
}
