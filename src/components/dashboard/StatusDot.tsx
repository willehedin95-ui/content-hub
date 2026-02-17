import { TranslationStatus } from "@/types";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  TranslationStatus | "none",
  { color: string; label: string }
> = {
  none: { color: "bg-gray-300", label: "Not started" },
  draft: { color: "bg-gray-400", label: "Draft" },
  translating: { color: "bg-yellow-400 animate-pulse", label: "Translating…" },
  translated: { color: "bg-blue-500", label: "Translated" },
  publishing: { color: "bg-orange-400 animate-pulse", label: "Publishing…" },
  published: { color: "bg-emerald-500", label: "Published" },
  error: { color: "bg-red-500", label: "Error" },
};

export default function StatusDot({
  status,
}: {
  status: TranslationStatus | "none";
}) {
  const cfg = statusConfig[status] ?? statusConfig.none;
  return (
    <span title={cfg.label} aria-label={cfg.label} role="status" className="inline-flex items-center">
      <span className={cn("w-2.5 h-2.5 rounded-full", cfg.color)} />
    </span>
  );
}
