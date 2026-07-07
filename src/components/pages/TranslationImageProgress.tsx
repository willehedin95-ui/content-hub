import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Inline image translation progress shown during active translation.
 * Displays "Images X/Y" with spinner or check icon.
 * Failures are NEVER shown as green (audit 2026-07-07, L4).
 */
export function InlineImageProgress({
  done,
  total,
  errors,
}: {
  done: number;
  total: number;
  errors: string[];
}) {
  const hasErrors = errors.length > 0;
  return (
    <div className="flex items-center gap-1.5">
      {done < total && !hasErrors ? (
        <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
      ) : hasErrors ? (
        <AlertCircle className="w-3 h-3 text-red-500" />
      ) : (
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      )}
      <span className={`text-xs ${hasErrors ? "text-red-600" : "text-amber-600"}`}>
        Images {done}/{total}
        {hasErrors && ` - ${errors[0]}`}
      </span>
    </div>
  );
}

/**
 * Background image translation progress shown after the text translation completes,
 * when images are still being translated in the background.
 */
export function BackgroundImageProgress({
  done,
  total,
  status,
  message,
}: {
  done: number;
  total: number;
  status: string;
  message?: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {status === "translating" ? (
        <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
      ) : status === "done" ? (
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      ) : (
        <AlertCircle className="w-3 h-3 text-red-500" />
      )}
      <span className={`text-xs ${status === "done" ? "text-emerald-600" : status === "error" ? "text-red-600" : "text-amber-600"}`}>
        Images {done}/{total}
        {status === "done" && " - done!"}
        {status === "error" && ` - ${message || "error"}`}
      </span>
    </div>
  );
}
