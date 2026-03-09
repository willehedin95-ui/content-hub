"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Eye, EyeOff, MousePointer } from "lucide-react";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LayerNode {
  tag: string;
  label: string;
  el: HTMLElement;
  depth: number;
  hidden: boolean;
  children: LayerNode[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAG_LABELS: Record<string, string> = {
  SECTION: "Section",
  DIV: "Div",
  HEADER: "Header",
  FOOTER: "Footer",
  NAV: "Nav",
  MAIN: "Main",
  ARTICLE: "Article",
  H1: "H1",
  H2: "H2",
  H3: "H3",
  H4: "H4",
  H5: "H5",
  P: "P",
  SPAN: "Span",
  IMG: "Image",
  A: "Link",
  BUTTON: "Button",
  UL: "List",
  OL: "List",
  LI: "Item",
  FORM: "Form",
  INPUT: "Input",
  FIGURE: "Figure",
  FIGCAPTION: "Caption",
  BLOCKQUOTE: "Quote",
  VIDEO: "Video",
};

// Only truly semantic/content elements shown in layers -- DIVs and SPANs are skipped
const SEMANTIC_TAGS = new Set([
  "SECTION",
  "HEADER",
  "FOOTER",
  "NAV",
  "MAIN",
  "ARTICLE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "P",
  "IMG",
  "BUTTON",
  "UL",
  "OL",
  "LI",
  "FORM",
  "FIGURE",
  "FIGCAPTION",
  "BLOCKQUOTE",
  "VIDEO",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTextPreview(el: HTMLElement): string {
  if (el.tagName === "IMG") {
    return (el as HTMLImageElement).alt || "[image]";
  }
  // Get only direct text content (not nested children text)
  let directText = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) directText += node.textContent || "";
  }
  directText = directText.trim();
  // Fall back to first child's text for containers
  if (!directText) {
    const text = el.textContent?.trim() || "";
    return text.slice(0, 30) + (text.length > 30 ? "..." : "");
  }
  return directText.slice(0, 30) + (directText.length > 30 ? "..." : "");
}

function buildTree(
  parent: HTMLElement,
  depth: number,
  maxDepth: number
): LayerNode[] {
  if (depth >= maxDepth) return [];
  const nodes: LayerNode[] = [];

  for (const child of Array.from(parent.children)) {
    const el = child as HTMLElement;
    if (
      !el.tagName ||
      el.tagName === "SCRIPT" ||
      el.tagName === "STYLE" ||
      el.tagName === "LINK"
    )
      continue;
    if (
      el.hasAttribute("data-cc-custom") ||
      el.hasAttribute("data-cc-injected")
    )
      continue;
    if (el.hasAttribute("data-cc-el-toolbar")) continue;

    const hidden =
      el.style.display === "none" || el.hasAttribute("data-cc-hidden");
    const shouldShow = SEMANTIC_TAGS.has(el.tagName);

    if (shouldShow) {
      const children = buildTree(el, depth + 1, maxDepth);
      nodes.push({
        tag: el.tagName,
        label: getTextPreview(el),
        el,
        depth,
        hidden,
        children,
      });
    } else {
      // Skip non-semantic wrappers but include their children
      nodes.push(...buildTree(el, depth, maxDepth));
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// LayerItem
// ---------------------------------------------------------------------------

function LayerItem({
  node,
  selectedEl,
  onSelect,
  onToggleVisibility,
}: {
  node: LayerNode;
  selectedEl: HTMLElement | null;
  onSelect: (el: HTMLElement) => void;
  onToggleVisibility: (el: HTMLElement) => void;
}) {
  // NAV and LIST at depth 0-1 start collapsed (nav menus are noisy)
  const defaultExpanded = !(
    (node.tag === "NAV" || node.tag === "UL" || node.tag === "OL") &&
    node.depth <= 1
  );
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isSelected = node.el === selectedEl;
  const hasChildren = node.children.length > 0;
  const tagLabel = TAG_LABELS[node.tag] || node.tag;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-0.5 pr-1 rounded cursor-pointer transition-colors ${
          isSelected
            ? "bg-indigo-50 text-indigo-700"
            : node.hidden
              ? "text-gray-300"
              : "text-gray-600 hover:bg-gray-50"
        }`}
        style={{ paddingLeft: `${node.depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 shrink-0"
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <button
          onClick={() => onSelect(node.el)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          <span
            className={`text-[10px] font-mono font-semibold uppercase shrink-0 ${
              isSelected ? "text-indigo-600" : "text-gray-400"
            }`}
          >
            {tagLabel}
          </span>
          {node.label && (
            <span
              className={`text-[10px] truncate ${
                isSelected ? "text-indigo-500" : "text-gray-400"
              }`}
            >
              {node.label}
            </span>
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(node.el);
          }}
          className={`p-0.5 shrink-0 transition-opacity ${
            node.hidden
              ? "text-gray-300 hover:text-gray-500"
              : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
          }`}
          title={node.hidden ? "Show element" : "Hide element"}
        >
          {node.hidden ? (
            <EyeOff className="w-3 h-3" />
          ) : (
            <Eye className="w-3 h-3" />
          )}
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <LayerItem
              key={i}
              node={child}
              selectedEl={selectedEl}
              onSelect={onSelect}
              onToggleVisibility={onToggleVisibility}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayersTab
// ---------------------------------------------------------------------------

export default function LayersTab() {
  const {
    iframeRef,
    selectedElRef,
    hasSelectedEl,
    layersRefreshKey,
    hiddenCount,
    revealHidden,
    toggleRevealHidden,
    handleToggleLayerVisibility,
    selectElementInIframe,
  } = useBuilder();

  const [layers, setLayers] = useState<LayerNode[]>([]);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) {
      setLayers([]);
      return;
    }
    const tree = buildTree(doc.body, 0, 5);
    setLayers(tree);
  }, [iframeRef, layersRefreshKey, hasSelectedEl]);

  function handleSelect(el: HTMLElement) {
    selectElementInIframe(el);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="px-3 py-3">
      {/* Hidden elements banner */}
      {hiddenCount > 0 && (
        <div className="flex items-center justify-between mb-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
          <span className="text-[11px] font-medium text-amber-700">
            {hiddenCount} hidden
          </span>
          <button
            onClick={toggleRevealHidden}
            className="text-[11px] font-medium text-amber-600 hover:text-amber-800 transition-colors"
          >
            {revealHidden ? "Hide" : "Reveal"}
          </button>
        </div>
      )}

      {layers.length === 0 ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2">
          <MousePointer className="w-3 h-3" />
          Loading page structure...
        </div>
      ) : (
        <div className="space-y-0">
          {layers.map((node, i) => (
            <LayerItem
              key={i}
              node={node}
              selectedEl={hasSelectedEl ? selectedElRef.current : null}
              onSelect={handleSelect}
              onToggleVisibility={handleToggleLayerVisibility}
            />
          ))}
        </div>
      )}
    </div>
  );
}
