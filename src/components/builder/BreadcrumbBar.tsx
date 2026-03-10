"use client";

import { useMemo, Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { useBuilder } from "./BuilderContext";
import { TAG_LABELS } from "./constants";

interface AncestorItem {
  el: HTMLElement;
  label: string;
}

export default function BreadcrumbBar() {
  const {
    selectedElRef,
    selectedElsRef,
    multiSelectCount,
    hasSelectedEl,
    layersRefreshKey,
    selectElementInIframe,
  } = useBuilder();

  const ancestors = useMemo<AncestorItem[]>(() => {
    if (!hasSelectedEl || !selectedElRef.current) return [];

    const chain: HTMLElement[] = [];
    let current = selectedElRef.current.parentElement;

    while (current && current.tagName !== "HTML") {
      chain.push(current);
      current = current.parentElement;
    }

    // Reverse so root (body) comes first
    chain.reverse();

    // Build labeled items for ancestors
    const items: AncestorItem[] = chain.map((el) => ({
      el,
      label:
        el.getAttribute("data-cc-name") ||
        TAG_LABELS[el.tagName] ||
        el.tagName,
    }));

    // Append the selected element itself as the last item
    const sel = selectedElRef.current;
    items.push({
      el: sel,
      label:
        sel.getAttribute("data-cc-name") ||
        TAG_LABELS[sel.tagName] ||
        sel.tagName,
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSelectedEl, layersRefreshKey]);

  if (!hasSelectedEl) return null;

  // Multi-select: show summary instead of ancestry breadcrumb
  if (multiSelectCount >= 2) {
    const tagCounts: Record<string, number> = {};
    selectedElsRef.current.forEach(el => {
      const label = TAG_LABELS[el.tagName] || el.tagName;
      tagCounts[label] = (tagCounts[label] || 0) + 1;
    });
    const summary = Object.entries(tagCounts)
      .map(([tag, count]) => `${count} ${tag}`)
      .join(", ");

    return (
      <div className="h-8 px-3 border-b border-gray-100 bg-indigo-50/80 flex items-center justify-between shrink-0">
        <span className="text-xs font-medium text-indigo-600">
          {multiSelectCount} elements selected
        </span>
        <span className="text-[10px] text-indigo-400">
          {summary}
        </span>
      </div>
    );
  }

  const rect = selectedElRef.current?.getBoundingClientRect();
  const dimensions = rect
    ? { w: Math.round(rect.width), h: Math.round(rect.height) }
    : null;

  return (
    <div className="h-8 px-3 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between shrink-0">
      {/* Left: breadcrumb path */}
      <div className="overflow-x-auto whitespace-nowrap flex items-center gap-0.5 min-w-0 flex-1 [&::-webkit-scrollbar]:hidden">
        {(() => {
          // Truncate deep nesting: show first 2 + "..." + last 2
          const shouldTruncate = ancestors.length > 5;
          const visible = shouldTruncate
            ? [...ancestors.slice(0, 2), null, ...ancestors.slice(-2)]
            : ancestors;
          const collapsedLabels = shouldTruncate
            ? ancestors.slice(2, -2).map((a) => a.label).join(" > ")
            : "";

          return visible.map((item, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
              )}
              {item === null ? (
                <span
                  className="text-xs px-1 py-0.5 text-gray-400 cursor-default"
                  title={collapsedLabels}
                >
                  &hellip;
                </span>
              ) : (
                <button
                  onClick={() => {
                    selectElementInIframe(item.el);
                    item.el.scrollIntoView({
                      behavior: "instant",
                      block: "center",
                    });
                  }}
                  className={`text-xs px-1 py-0.5 rounded transition-colors shrink-0 ${
                    item === ancestors[ancestors.length - 1]
                      ? "text-indigo-600 font-medium bg-indigo-50"
                      : "text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                  }`}
                >
                  {item.label}
                </button>
              )}
            </Fragment>
          ));
        })()}
      </div>

      {/* Right: element info */}
      <div className="flex items-center gap-2 ml-3 shrink-0">
        <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
          {selectedElRef.current?.tagName}
        </span>
        {dimensions && (
          <span className="text-[10px] text-gray-400">
            {dimensions.w} &times; {dimensions.h}
          </span>
        )}
      </div>
    </div>
  );
}
