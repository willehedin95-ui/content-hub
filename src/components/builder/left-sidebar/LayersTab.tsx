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
  ListTree,
} from "lucide-react";
import { useBuilder } from "../BuilderContext";
import { TAG_LABELS, SKIP_TAGS } from "../constants";

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

type LayersMode = "simplified" | "all";

const LAYERS_MODE_KEY = "content-hub-layers-mode";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Tags kept in simplified mode (content + semantic containers)
const SIMPLIFIED_KEEP_TAGS = new Set([
  // Content elements
  "H1", "H2", "H3", "H4", "H5",
  "P", "BLOCKQUOTE",
  "IMG", "PICTURE", "VIDEO",
  "A", "BUTTON",
  "FORM", "INPUT", "SELECT", "TEXTAREA", "LABEL",
  "UL", "OL", "LI",
  "TABLE", "TR", "TD", "TH",
  "FIGURE", "FIGCAPTION",
  // Semantic containers
  "HEADER", "FOOTER", "NAV", "MAIN", "ARTICLE", "SECTION", "ASIDE",
]);

// ---------------------------------------------------------------------------
// Icon color per element type (Replo/Figma-inspired)
// ---------------------------------------------------------------------------

function getIconColor(tag: string, isSelected: boolean): string {
  if (isSelected) return "text-indigo-600";
  switch (tag) {
    case "IMG":
    case "PICTURE":
      return "text-emerald-500";
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "P":
    case "BLOCKQUOTE":
    case "LABEL":
    case "FIGCAPTION":
      return "text-blue-500";
    case "SPAN":
      return "text-blue-400";
    case "A":
      return "text-indigo-500";
    case "UL":
    case "OL":
    case "LI":
      return "text-violet-500";
    case "VIDEO":
      return "text-pink-500";
    case "SECTION":
    case "HEADER":
    case "FOOTER":
    case "MAIN":
    case "ARTICLE":
    case "NAV":
    case "ASIDE":
      return "text-amber-500";
    case "BUTTON":
    case "INPUT":
    case "SELECT":
    case "TEXTAREA":
    case "FORM":
      return "text-orange-500";
    case "TABLE":
    case "TR":
    case "TD":
    case "TH":
      return "text-cyan-500";
    case "DIV":
      return "text-gray-400";
    default:
      return "text-gray-400";
  }
}

// Tag icons for the layer tree
function TagIcon({ tag, className }: { tag: string; className?: string }) {
  const cn = className || "w-4 h-4";
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
    case "FIGCAPTION":
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
    case "ASIDE":
      return <Layout className={cn} />;
    case "BUTTON":
    case "INPUT":
    case "SELECT":
    case "TEXTAREA":
    case "FORM":
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
// Simplify tree — keep only content/semantic elements, skip layout wrappers
// ---------------------------------------------------------------------------

function simplifyTree(nodes: LayerNode[], depth: number): LayerNode[] {
  const result: LayerNode[] = [];
  for (const node of nodes) {
    if (SIMPLIFIED_KEEP_TAGS.has(node.tag)) {
      // Keep this node, recursively simplify children
      result.push({
        ...node,
        depth,
        children: simplifyTree(node.children, depth + 1),
      });
    } else if (node.label && node.children.length === 0) {
      // Wrapper with text content and no sub-elements — treat as content
      result.push({ ...node, depth, children: [] });
    } else {
      // Layout wrapper — skip, promote children
      result.push(...simplifyTree(node.children, depth));
    }
  }
  return result;
}

// Collect all HTMLElements present in a tree
function collectElements(nodes: LayerNode[], set: Set<HTMLElement>) {
  for (const n of nodes) {
    set.add(n.el);
    collectElements(n.children, set);
  }
}

// ---------------------------------------------------------------------------
// LayerItem
// ---------------------------------------------------------------------------

function LayerItem({
  node,
  selectedEl,
  selectedEls,
  onSelect,
  onToggleVisibility,
  onDragStart,
  onDragOver,
  onDrop,
  onContextMenu,
  dragOverEl,
  forceExpand,
  renamingEl,
  onRename,
  onCancelRename,
}: {
  node: LayerNode;
  selectedEl: HTMLElement | null;
  selectedEls: Set<HTMLElement>;
  onSelect: (el: HTMLElement) => void;
  onToggleVisibility: (el: HTMLElement) => void;
  onDragStart: (el: HTMLElement) => void;
  onDragOver: (e: React.DragEvent, el: HTMLElement) => void;
  onDrop: (el: HTMLElement) => void;
  onContextMenu: (el: HTMLElement, x: number, y: number) => void;
  dragOverEl: HTMLElement | null;
  forceExpand: boolean;
  renamingEl: HTMLElement | null;
  onRename: (newName: string) => void;
  onCancelRename: () => void;
}) {
  const isSelected = node.el === selectedEl || selectedEls.has(node.el);
  const hasChildren = node.children.length > 0;
  const tagLabel = TAG_LABELS[node.tag] || node.tag;
  const displayName = node.el.getAttribute("data-cc-name") || tagLabel;
  const isDragOver = dragOverEl === node.el;
  const isRenaming = renamingEl === node.el;
  const isContainer =
    node.tag === "DIV" || node.tag === "SPAN";
  const itemRef = useRef<HTMLDivElement>(null);
  const iconColor = node.hidden && !isSelected ? "text-gray-300" : getIconColor(node.tag, isSelected);

  // Auto-expand if selected element is inside this node
  const shouldAutoExpand =
    forceExpand ||
    (selectedEl && hasChildren && containsElement(node, selectedEl)) ||
    (selectedEls.size > 1 && hasChildren && Array.from(selectedEls).some(sel => sel !== selectedEl && containsElement(node, sel)));

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
        onContextMenu={(e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(node.el, e.clientX, e.clientY);
        }}
        className={`group flex items-center h-9 pr-2 cursor-pointer transition-colors border-l-2 ${
          isDragOver
            ? "bg-indigo-100 border-l-indigo-400"
            : isSelected
              ? "bg-indigo-50 border-l-indigo-500 ring-1 ring-inset ring-indigo-200"
              : node.hidden
                ? "text-gray-300 border-l-transparent"
                : "hover:bg-gray-50 border-l-transparent"
        }`}
        style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
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
              className={`w-3.5 h-3.5 transition-transform duration-150 ${
                expanded ? "rotate-90" : ""
              } ${isSelected ? "text-indigo-600" : "text-gray-500"}`}
            />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}

        {/* Tag icon — colored per element type */}
        <span className={`shrink-0 mr-2 ${iconColor}`}>
          <TagIcon tag={node.tag} className="w-4 h-4" />
        </span>

        {/* Tag label + text preview (or inline rename input) */}
        <span className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
          {isRenaming ? (
            <input
              autoFocus
              defaultValue={node.el.getAttribute("data-cc-name") || ""}
              placeholder={tagLabel}
              onBlur={(e) => onRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename((e.target as HTMLInputElement).value);
                if (e.key === "Escape") onCancelRename();
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[13px] bg-white border border-indigo-300 rounded px-1 py-0 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          ) : (
            <>
              <span
                className={`text-[13px] font-medium shrink-0 ${
                  isSelected
                    ? "text-indigo-700"
                    : node.hidden
                      ? "text-gray-300"
                      : isContainer
                        ? "text-gray-500"
                        : "text-gray-700"
                }`}
              >
                {displayName}
              </span>
              {node.label && (
                <span
                  className={`text-[11px] truncate ${
                    isSelected ? "text-indigo-500" : node.hidden ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {node.label}
                </span>
              )}
            </>
          )}
        </span>

        {/* Drag handle + visibility toggle */}
        <span className="flex items-center gap-0.5 shrink-0">
          <span className="p-0.5 cursor-grab opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity">
            <GripVertical className="w-3.5 h-3.5" />
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(node.el);
            }}
            className={`p-0.5 transition-opacity ${
              node.hidden
                ? "text-gray-400 hover:text-gray-600"
                : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
            }`}
            title={node.hidden ? "Show element" : "Hide element"}
          >
            {node.hidden ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
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
              selectedEls={selectedEls}
              onSelect={onSelect}
              onToggleVisibility={onToggleVisibility}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onContextMenu={onContextMenu}
              dragOverEl={dragOverEl}
              forceExpand={false}
              renamingEl={renamingEl}
              onRename={onRename}
              onCancelRename={onCancelRename}
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
    selectedElsRef,
    multiSelectCount,
    hasSelectedEl,
    layersRefreshKey,
    handleToggleLayerVisibility,
    selectElementInIframe,
    pushUndoSnapshot,
    markDirty,
    openContextMenu,
    renamingEl,
    setRenamingEl,
    handleRenameElement,
  } = useBuilder();

  const [layers, setLayers] = useState<LayerNode[]>([]);
  const [search, setSearch] = useState("");
  const [depthTruncated, setDepthTruncated] = useState(false);
  const dragSourceRef = useRef<HTMLElement | null>(null);
  const [dragOverEl, setDragOverEl] = useState<HTMLElement | null>(null);

  // Layers mode — persisted to localStorage
  const [layersMode, setLayersMode] = useState<LayersMode>(() => {
    if (typeof window === "undefined") return "simplified";
    return (localStorage.getItem(LAYERS_MODE_KEY) as LayersMode) || "simplified";
  });

  const toggleLayersMode = useCallback(() => {
    setLayersMode((prev) => {
      const next = prev === "simplified" ? "all" : "simplified";
      localStorage.setItem(LAYERS_MODE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) {
      setLayers([]);
      setDepthTruncated(false);
      return;
    }
    const MAX_DEPTH = 20;
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

  // Apply simplification + search filter
  const displayLayers = useMemo(() => {
    const base = layersMode === "simplified" ? simplifyTree(layers, 0) : layers;
    return search.trim() ? filterTree(base, search.trim()) : base;
  }, [layers, layersMode, search]);

  // Build set of visible elements for effectiveSelectedEl
  const visibleElements = useMemo(() => {
    const set = new Set<HTMLElement>();
    collectElements(displayLayers, set);
    return set;
  }, [displayLayers]);

  // Resolve selectedEl to nearest visible ancestor in simplified mode
  const rawSelectedEl = hasSelectedEl ? selectedElRef.current : null;
  const effectiveSelectedEl = useMemo(() => {
    if (!rawSelectedEl) return null;
    if (visibleElements.has(rawSelectedEl)) return rawSelectedEl;
    // Walk up DOM to find nearest visible ancestor
    let el: HTMLElement | null = rawSelectedEl.parentElement;
    while (el) {
      if (visibleElements.has(el)) return el;
      el = el.parentElement;
    }
    return null;
  }, [rawSelectedEl, visibleElements]);

  // Snapshot multi-select set for rendering (re-derived when multiSelectCount changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedEls = useMemo(() => new Set(selectedElsRef.current), [multiSelectCount]);

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

  return (
    <div className="py-2">
      {/* Search + toggle row */}
      <div className="flex items-center gap-1.5 mb-2 px-3">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter layers..."
            className="w-full pl-7 pr-7 py-2 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 placeholder:text-gray-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={toggleLayersMode}
          className={`p-1.5 rounded-md transition-colors shrink-0 ${
            layersMode === "simplified"
              ? "bg-indigo-100 text-indigo-600"
              : "bg-gray-100 text-gray-500 hover:text-gray-700"
          }`}
          title={
            layersMode === "simplified"
              ? "Simplified view — click for all elements"
              : "All elements — click for simplified view"
          }
        >
          <ListTree className="w-4 h-4" />
        </button>
      </div>

      {/* Depth truncation warning */}
      {depthTruncated && (
        <div className="mb-2 mx-3 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
          <span className="text-[11px] font-medium text-blue-700">
            Deep nesting detected — showing first 8 levels only
          </span>
        </div>
      )}


      {layers.length === 0 ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2 px-3">
          <MousePointer className="w-3.5 h-3.5" />
          Loading page structure...
        </div>
      ) : displayLayers.length === 0 ? (
        <div className="text-xs text-gray-500 py-4 text-center px-3">
          {layersMode === "simplified" && layers.length > 0 ? (
            <>
              <p className="mb-1">No content elements found</p>
              <button
                onClick={toggleLayersMode}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Show all elements
              </button>
            </>
          ) : (
            "No matching elements"
          )}
        </div>
      ) : (
        <div>
          {displayLayers.map((node, i) => (
            <LayerItem
              key={i}
              node={node}
              selectedEl={effectiveSelectedEl}
              selectedEls={selectedEls}
              onSelect={handleSelect}
              onToggleVisibility={handleToggleLayerVisibility}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onContextMenu={openContextMenu}
              dragOverEl={dragOverEl}
              forceExpand={false}
              renamingEl={renamingEl}
              onRename={handleRenameElement}
              onCancelRename={() => setRenamingEl(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
