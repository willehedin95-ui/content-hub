import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import {
  Upload,
  Pencil,
  MoreHorizontal,
  RefreshCw,
  Image as ImageIcon,
  Trash2,
  Loader2,
} from "lucide-react";

export default function TranslationActions({
  pageId,
  languageValue,
  translationId,
  canPublish,
  loading,
  hasSuggestedCorrections,
  onPublish,
  onFixQuality,
  onRegenerate,
  onOpenImageModal,
  onDelete,
}: {
  pageId: string;
  languageValue: string;
  translationId: string | undefined;
  canPublish: boolean;
  loading: "translate" | "publish" | "analyze" | "regenerate" | "fix" | null;
  hasSuggestedCorrections: boolean;
  onPublish: () => void;
  onFixQuality: () => void;
  onRegenerate: () => void;
  onOpenImageModal: () => void;
  onDelete: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close "more" dropdown on outside click
  useEffect(() => {
    if (!showMore) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMore]);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Link
        href={`/pages/${pageId}/edit/${languageValue}`}
        className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        Edit
      </Link>
      <button
        onClick={onPublish}
        disabled={!canPublish || loading !== null}
        className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        Publish
      </button>
      {/* Secondary actions menu */}
      {canPublish && (
        <div ref={moreRef} className="relative">
          <button
            onClick={() => setShowMore((p) => !p)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMore && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
              {hasSuggestedCorrections && (
                <button
                  onClick={() => { setShowMore(false); onFixQuality(); }}
                  disabled={loading !== null}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors"
                >
                  {loading === "fix" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Fix quality issues
                </button>
              )}
              <button
                onClick={() => { setShowMore(false); onRegenerate(); }}
                disabled={loading !== null}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                {loading === "regenerate" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Regenerate translation
              </button>
              <button
                onClick={() => {
                  setShowMore(false);
                  onOpenImageModal();
                }}
                disabled={loading !== null}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Translate images
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { setShowMore(false); onDelete(); }}
                disabled={loading !== null}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete translation
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
