"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  MousePointer,
  Search,
  X,
  Image as ImageIcon,
  Type,
  Box,
  Layout,
  Link2,
  List,
  Film,
  Square,
} from "lucide-react";
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
  DIV: "Container",
  HEADER: "Header",
  FOOTER: "Footer",
  NAV: "Nav",
  MAIN: "Main",
  ARTICLE: "Article",
  H1: "Heading 1",
  H2: "Heading 2",
  H3: "Heading 3",
  H4: "Heading 4",
  H5: "Heading 5",
  P: "Paragraph",
  SPAN: "Span",
  IMG: "Image",
  A: "Link",
  BUTTON: "Button",
  UL: "List",
  OL: "List",
  LI: "List Item",
  FORM: "Form",
  INPUT: "Input",
  FIGURE: "Figure",
  FIGCAPTION: "Caption",
  BLOCKQUOTE: "Quote",
  VIDEO: "Video",
  TABLE: "Table",
  TR: "Row",
  TD: "Cell",
  TH: "Header Cell",
  LABEL: "Label",
  SELECT: "Select",
  TEXTAREA: "Text Area",
  PICTURE: "Picture",
  SOURCE: "Source",
};

// Tags to always skip in the layer tree
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "NOSCRIPT",
  "META",
  "HEAD",
  "BR",
  "HR",
  "SVG",
  "PATH",
  "CIRCLE",
  "RECT",
  "LINE",
  "POLYGON",
  "POLYLINE",
  "G",
  "DEFS",
  "CLIPPATH",
  "USE",
  "SYMBOL",
]);

// Tag icons for the layer tree
function TagIcon({ tag, className }: { tag: string; className?: string }) {
  const cn = className || "w-3 h-3";
  switch (tag) {
    case "IMG":
    case "PICTURE":
      return <ImageIcon className={cn} />;
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "P":
    case "SPAN":
    case "BLOCKQUOTE":
    case "LABEL":
      return <Type className={cn} />;
    case "A":
      return <Link2 className={cn} />;
    case "UL":
    case "OL":
      return <List className={cn} />;
    case "VIDEO":
      return <Film className={cn} />;
    case "SECTION":
    case "HEADER":
    case "FOOTER":
    case "MAIN":
    case "ARTICLE":
    case "NAV":
      return <Layout className={cn} />;
    case "BUTTON":
    case "INPUT":
    case "SELECT":
    case "TEXTAREA":
      return <Square className={cn} />;
    default:
      return <Box className={cn} />;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSmartLabel(el: HTMLElement): string {
  // For images, show alt text
  if (el.tagName === "IMG") {
    return (el as HTMLImageElement).alt || "";
  }

  // For elements with a useful class name, use that
  // Use classList.toString() to handle both string className and DOMTokenList
  const classString = el.classList.toString();
  if (classString.trim()) {
    // Pick the first meaningful class (skip utility classes)
    const classes = classString.split(/\s+/).filter((c) => c.length > 2 && !c.startsWith("data-"));
    if (classes.length > 0) {
      // Use the first class, humanize it
      const cls = classes[0].replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
      if (cls.length <= 25) return cls;
    }
  }

  // For text elements, show direct text preview
  let directText = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) directText += node.textContent || "";
  }
  directText = directText.trim();
  if (directText) {
    return directText.slice(0, 25) + (directText.length > 25 ? "..." : "");
  }

  return "";
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
    if (!el.tagName || SKIP_TAGS.has(el.tagName)) continue;
    if (
      el.hasAttribute("data-cc-custom") ||
      el.hasAttribute("data-cc-injected") ||
      el.hasAttribute("data-cc-el-toolbar")
    )
      continue;

    const hidden =
      el.style.display === "none" || el.hasAttribute("data-cc-hidden");

    const children = buildTree(el, depth + 1, maxDepth);

    // Show element if it has a known tag label, or has visible children, or has text content
    const hasKnownTag = !!TAG_LABELS[el.tagName];
    const hasContent = el.childNodes.length > 0;
    const isContainer = el.tagName === "DIV" || el.tagName === "SPAN";

    // For DIV/SPAN: only show if they have direct content or child layers
    if (isContainer && !hasContent && children.length === 0) continue;

    // For DIV containers with a single child layer and no direct text, flatten
    // Keep original depth for children to maintain proper indentation
    if (isContainer && children.length === 1 && !getSmartLabel(el)) {
      nodes.push(...children);
      continue;
    }

    if (hasKnownTag || children.length > 0) {
      nodes.push({
        tag: el.tagName,
        label: getSmartLabel(el),
        el,
        depth,
        hidden,
        children,
      });
    } else {
      // Unknown tag — include children only
      nodes.push(...buildTree(el, depth, maxDepth));
    }
  }

  return nodes;
}

// Check if a node or any descendant contains the selected element
function containsElement(node: LayerNode, target: HTMLElement): boolean {
  if (node.el === target) return true;
  return node.children.some((child) => containsElement(child, target));
}

// ---------------------------------------------------------------------------
// Filter tree by search query
// ---------------------------------------------------------------------------

function filterTree(nodes: LayerNode[], query: string): LayerNode[] {
  const q = query.toLowerCase();
  const result: LayerNode[] = [];
  for (const node of nodes) {
    const tagLabel = (TAG_LABELS[node.tag] || node.tag).toLowerCase();
    const selfMatch =
      tagLabel.includes(q) || node.label.toLowerCase().includes(q);
    const filteredChildren = filterTree(node.children, query);
    if (selfMatch || filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// LayerItem
// ---------------------------------------------------------------------------

function LayerItem({
  node,
  selectedEl,
  onSelect,
  onToggleVisibility,
  onDragStart,
  onDragOver,
  onDrop,
  dragOverEl,
  forceExpand,
}: {
  node: LayerNode;
  selectedEl: HTMLElement | null;
  onSelect: (el: HTMLElement) => void;
  onToggleVisibility: (el: HTMLElement) => void;
  onDragStart: (el: HTMLElement) => void;
  onDragOver: (e: React.DragEvent, el: HTMLElement) => void;
  onDrop: (el: HTMLElement) => void;
  dragOverEl: HTMLElement | null;
  forceExpand: boolean;
}) {
  const isSelected = node.el === selectedEl;
  const hasChildren = node.children.length > 0;
  const tagLabel = TAG_LABELS[node.tag] || node.tag;
  const isDragOver = dragOverEl === node.el;
  const isContainer =
    node.tag === "DIV" ||
    node.tag === "SPAN" ||
    node.tag === "SECTION" ||
    node.tag === "MAIN" ||
    node.tag === "ARTICLE";
  const itemRef = useRef<HTMLDivElement>(null);

  // Auto-expand if selected element is inside this node
  const shouldAutoExpand =
    forceExpand ||
    (selectedEl && hasChildren && containsElement(node, selectedEl));

  // NAV and LIST start collapsed unless they contain selection
  const defaultExpanded = !(
    (node.tag === "NAV" || node.tag === "UL" || node.tag === "OL") &&
    node.depth <= 1
  );
  const [manualExpanded, setManualExpanded] = useState(defaultExpanded);
  const expanded = shouldAutoExpand || manualExpanded;

  // Auto-scroll selected item into view
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected]);

  return (
    <div>
      <div
        ref={isSelected ? itemRef : undefined}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(node.el);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOver(e, node.el);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop(node.el);
        }}
        onClick={() => onSelect(node.el)}
        className={`group flex items-center h-7 pr-1 cursor-pointer transition-colors border-l-2 ${
          isDragOver
            ? "bg-indigo-100 border-l-indigo-400"
            : isSelected
              ? "bg-indigo-500/10 border-l-indigo-500"
              : node.hidden
                ? "text-gray-300 border-l-transparent"
                : "text-gray-600 hover:bg-gray-50 border-l-transparent"
        }`}
        style={{ paddingLeft: `${node.depth * 16 + 4}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setManualExpanded(!manualExpanded);
            }}
            className="p-0.5 shrink-0"
          >
            <ChevronRight
              className={`w-3 h-3 transition-transform duration-150 ${
                expanded ? "rotate-90" : ""
              } ${isSelected ? "text-indigo-600" : "text-gray-400"}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Tag icon */}
        <span
          className={`shrink-0 mr-1.5 ${
            isSelected ? "text-indigo-600" : isContainer ? "text-gray-300" : "text-gray-400"
          }`}
        >
          <TagIcon tag={node.tag} className="w-3 h-3" />
        </span>

        {/* Tag label + text preview */}
        <span className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
          <span
            className={`text-[11px] font-medium shrink-0 ${
              isSelected
                ? "text-indigo-700"
                : isContainer
                  ? "text-gray-400"
                  : "text-gray-600"
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
        </span>

        {/* Drag handle + visibility toggle */}
        <span className="flex items-center gap-0.5 shrink-0">
          <span className="p-0.5 cursor-grab opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity">
            <GripVertical className="w-3 h-3" />
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(node.el);
            }}
            className={`p-0.5 transition-opacity ${
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
        </span>
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
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              dragOverEl={dragOverEl}
              forceExpand={false}
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
    pushUndoSnapshot,
    markDirty,
  } = useBuilder();

  const [layers, setLayers] = useState<LayerNode[]>([]);
  const [search, setSearch] = useState("");
  const [depthTruncated, setDepthTruncated] = useState(false);
  const dragSourceRef = useRef<HTMLElement | null>(null);
  const [dragOverEl, setDragOverEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) {
      setLayers([]);
      setDepthTruncated(false);
      return;
    }
    const MAX_DEPTH = 8;
    const tree = buildTree(doc.body, 0, MAX_DEPTH);
    setLayers(tree);

    // Check if depth was truncated
    const checkDepth = (node: Element, depth: number): boolean => {
      if (depth >= MAX_DEPTH) return true;
      for (const child of Array.from(node.children)) {
        if (checkDepth(child, depth + 1)) return true;
      }
      return false;
    };
    setDepthTruncated(checkDepth(doc.body, 0));
  }, [iframeRef, layersRefreshKey, hasSelectedEl]);

  const filteredLayers = useMemo(
    () => (search.trim() ? filterTree(layers, search.trim()) : layers),
    [layers, search]
  );

  const handleSelect = useCallback(
    (el: HTMLElement) => {
      selectElementInIframe(el);
      // Use instant scroll to avoid competing with layers panel auto-scroll
      el.scrollIntoView({ behavior: "instant", block: "center" });
    },
    [selectElementInIframe]
  );

  function handleDragStart(el: HTMLElement) {
    dragSourceRef.current = el;
  }

  function handleDragOver(_e: React.DragEvent, el: HTMLElement) {
    setDragOverEl(el);
  }

  function handleDrop(targetEl: HTMLElement) {
    const sourceEl = dragSourceRef.current;
    setDragOverEl(null);
    dragSourceRef.current = null;
    if (!sourceEl || sourceEl === targetEl) return;
    if (sourceEl.contains(targetEl) || targetEl.contains(sourceEl)) return;
    pushUndoSnapshot();
    targetEl.parentNode?.insertBefore(sourceEl, targetEl);
    markDirty();
  }

  const selectedEl = hasSelectedEl ? selectedElRef.current : null;

  return (
    <div className="py-2">
      {/* Search input */}
      <div className="relative mb-2 px-3">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter layers..."
          className="w-full pl-7 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 placeholder:text-gray-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Depth truncation warning */}
      {depthTruncated && (
        <div className="mb-2 mx-3 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
          <span className="text-[11px] font-medium text-blue-700">
            Deep nesting detected — showing first 8 levels only
          </span>
        </div>
      )}

      {/* Hidden elements banner */}
      {hiddenCount > 0 && (
        <div className="flex items-center justify-between mb-2 mx-3 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
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
        <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2 px-3">
          <MousePointer className="w-3 h-3" />
          Loading page structure...
        </div>
      ) : filteredLayers.length === 0 ? (
        <div className="text-xs text-gray-400 py-2 text-center">
          No matching elements
        </div>
      ) : (
        <div>
          {filteredLayers.map((node, i) => (
            <LayerItem
              key={i}
              node={node}
              selectedEl={selectedEl}
              onSelect={handleSelect}
              onToggleVisibility={handleToggleLayerVisibility}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              dragOverEl={dragOverEl}
              forceExpand={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
