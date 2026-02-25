import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Inline image translation progress shown during active translation.
 * Displays "Images X/Y" with spinner or check icon.
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
  return (
    <div className="flex items-center gap-1.5">
      {done < total ? (
        <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
      ) : (
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      )}
      <span className="text-xs text-amber-600">
        Images {done}/{total}
        {errors.length > 0 && ` (${errors.length} failed)`}
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
}: {
  done: number;
  total: number;
  status: string;
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
        {status === "done" && " \u2014 done!"}
        {status === "error" && " \u2014 error"}
      </span>
    </div>
  );
}
