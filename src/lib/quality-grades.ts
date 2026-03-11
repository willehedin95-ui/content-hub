export type QualityGrade = "great" | "good" | "needs_fixes";

interface GradeConfig {
  label: string;
  color: string;       // text color class
  bg: string;          // background + border classes
  icon: "check" | "minus" | "alert";
}

const GRADE_CONFIG: Record<QualityGrade, GradeConfig> = {
  great: {
    label: "Great",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: "check",
  },
  good: {
    label: "Good",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: "minus",
  },
  needs_fixes: {
    label: "Needs fixes",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: "alert",
  },
};

export function gradeConfig(grade: QualityGrade): GradeConfig {
  return GRADE_CONFIG[grade];
}

/**
 * Derive grade for page translations.
 * Uses: fluency_issues, grammar_issues, context_errors, name_localization
 */
export function derivePageGrade(analysis: {
  fluency_issues?: string[];
  grammar_issues?: string[];
  context_errors?: string[];
  name_localization?: string[];
}): QualityGrade {
  const context = analysis.context_errors?.length ?? 0;
  const names = analysis.name_localization?.length ?? 0;
  const grammar = analysis.grammar_issues?.length ?? 0;
  const fluency = analysis.fluency_issues?.length ?? 0;

  if (context > 0 || names > 0 || grammar >= 3) return "needs_fixes";
  if (grammar > 0 || fluency > 2) return "good";
  return "great";
}

/**
 * Derive grade for image vision analysis.
 * Uses: spelling_errors, grammar_issues, missing_text
 */
export function deriveImageGrade(analysis: {
  spelling_errors?: string[];
  grammar_issues?: string[];
  missing_text?: string[];
}): QualityGrade {
  const spelling = analysis.spelling_errors?.length ?? 0;
  const missing = analysis.missing_text?.length ?? 0;
  const grammar = analysis.grammar_issues?.length ?? 0;

  if (spelling > 0 || missing > 0 || grammar >= 3) return "needs_fixes";
  if (grammar > 0) return "good";
  return "great";
}

/**
 * Derive grade for ad copy text analysis.
 * Uses: fluency_issues, grammar_issues, context_errors
 */
export function deriveCopyGrade(analysis: {
  fluency_issues?: string[];
  grammar_issues?: string[];
  context_errors?: string[];
}): QualityGrade {
  const context = analysis.context_errors?.length ?? 0;
  const grammar = analysis.grammar_issues?.length ?? 0;
  const fluency = analysis.fluency_issues?.length ?? 0;

  if (context > 0 || grammar >= 3) return "needs_fixes";
  if (grammar > 0 || fluency > 2) return "good";
  return "great";
}

/** Map grade to a backward-compat numeric score for DB storage */
export function gradeToNumeric(grade: QualityGrade): number {
  switch (grade) {
    case "great": return 95;
    case "good": return 80;
    case "needs_fixes": return 40;
  }
}
