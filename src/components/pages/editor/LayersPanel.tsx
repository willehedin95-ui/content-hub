"use client";

import { useState, useEffect, RefObject, MutableRefObject } from "react";
import { ChevronDown, Eye, EyeOff, MousePointer } from "lucide-react";

interface LayerNode {
  tag: string;
  label: string;
  el: HTMLElement;
  depth: number;
  hidden: boolean;
  children: LayerNode[];
}

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  selectedElRef: MutableRefObject<HTMLElement | null>;
  hasSelectedEl: boolean;
  refreshKey: number;
  onSelectElement: (el: HTMLElement) => void;
  onToggleVisibility: (el: HTMLElement) => void;
  markDirty: () => void;
}

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

const SEMANTIC_TAGS = new Set([
  "SECTION", "DIV", "HEADER", "FOOTER", "NAV", "MAIN", "ARTICLE",
  "H1", "H2", "H3", "H4", "H5",
  "P", "IMG", "A", "BUTTON",
  "UL", "OL", "LI",
  "FORM", "FIGURE", "FIGCAPTION", "BLOCKQUOTE", "VIDEO",
]);

function getTextPreview(el: HTMLElement): string {
  // For images, show alt text
  if (el.tagName === "IMG") {
    return (el as HTMLImageElement).alt || "[image]";
  }
  // Get direct text content (not children's)
  const text = el.textContent?.trim() || "";
  return text.slice(0, 40) + (text.length > 40 ? "..." : "");
}

function buildTree(parent: HTMLElement, depth: number, maxDepth: number): LayerNode[] {
  if (depth >= maxDepth) return [];
  const nodes: LayerNode[] = [];

  for (const child of Array.from(parent.children)) {
    const el = child as HTMLElement;
    if (!el.tagName || el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "LINK") continue;
    if (el.hasAttribute("data-cc-custom") || el.hasAttribute("data-cc-injected")) continue;

    const isSemantic = SEMANTIC_TAGS.has(el.tagName);
    const hidden = el.style.display === "none" || el.hasAttribute("data-cc-hidden");

    if (isSemantic) {
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
  const [expanded, setExpanded] = useState(true);
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
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
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
          <span className={`text-[10px] font-mono font-semibold uppercase shrink-0 ${
            isSelected ? "text-indigo-600" : "text-gray-400"
          }`}>
            {tagLabel}
          </span>
          {node.label && (
            <span className={`text-[10px] truncate ${
              isSelected ? "text-indigo-500" : "text-gray-400"
            }`}>
              {node.label}
            </span>
          )}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.el); }}
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

export default function LayersPanel({
  iframeRef,
  selectedElRef,
  hasSelectedEl,
  refreshKey,
  onSelectElement,
  onToggleVisibility,
}: Props) {
  const [layers, setLayers] = useState<LayerNode[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) {
      setLayers([]);
      return;
    }
    const tree = buildTree(doc.body, 0, 4);
    setLayers(tree);
  }, [iframeRef, refreshKey, hasSelectedEl]);

  function handleSelect(el: HTMLElement) {
    // Deselect previous
    if (selectedElRef.current) {
      selectedElRef.current.removeAttribute("data-cc-selected");
    }
    // Select new
    el.setAttribute("data-cc-selected", "");
    selectedElRef.current = el;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    onSelectElement(el);
  }

  return (
    <div className="px-4 py-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full mb-2"
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Layers
        </p>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      </button>

      {!collapsed && (
        layers.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2">
            <MousePointer className="w-3 h-3" />
            Loading page structure...
          </div>
        ) : (
          <div className="space-y-0 max-h-64 overflow-y-auto -mx-1 px-1">
            {layers.map((node, i) => (
              <LayerItem
                key={i}
                node={node}
                selectedEl={hasSelectedEl ? selectedElRef.current : null}
                onSelect={handleSelect}
                onToggleVisibility={onToggleVisibility}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
