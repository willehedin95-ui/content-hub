"use client";
import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useQuiz } from "./QuizContext";
import { topoOrderSteps, addSubEl, removeSubEl, setTrafficSplit } from "@/lib/quiz-graph";
import { PALETTE_ITEMS, type PaletteItem } from "./ElementPalette";
import type { SubEl, StepNode } from "@/types/quiz";

// kind -> palette item (icon + label), for rendering element rows
const ITEM_BY_KIND = Object.fromEntries(
  PALETTE_ITEMS.map((i) => [i.kind, i]),
) as Record<PaletteItem["kind"], PaletteItem>;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Short one-line summary of an element, shown greyed next to its kind label. */
function elementSummary(el: SubEl): string {
  switch (el.kind) {
    case "title":
      return stripTags(el.text) || "Untitled";
    case "text":
      return stripTags(el.text) || "Empty";
    case "question": {
      const first = el.options[0]?.label;
      return first ? `${el.options.length} val · ${first}` : `${el.options.length} val`;
    }
    case "image":
      return el.alt || "Bild";
    case "custom_html":
      return "HTML";
    case "loading":
      return el.text || "Laddar";
    case "range_slider":
      return `{${el.variable}}`;
    case "text_input":
      return `{${el.variable}}`;
    case "testimonial_slider":
      return `${el.items.length} recensioner`;
  }
  return "";
}

function kindLabel(kind: SubEl["kind"]): string {
  return ITEM_BY_KIND[kind]?.label ?? kind;
}

/** Strip a "(A control)" / "(B variant)" suffix so a variant group can show one clean name. */
function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*(?:variant|control)[^)]*\)\s*$/i, "").trim() || name;
}

/** One entry in the accordion: either a lone step or an A/B variant group. */
type StepGroup = { key: string; nodes: StepNode[]; isVariant: boolean };

/** Collapse variant siblings (same variantGroupId) into a single entry, in flow order. */
function buildGroups(steps: StepNode[]): StepGroup[] {
  const groups: StepGroup[] = [];
  const seen = new Set<string>();
  for (const s of steps) {
    if (s.variantGroupId) {
      if (seen.has(s.variantGroupId)) continue;
      seen.add(s.variantGroupId);
      // Control / non-"variant" member first so it reads as Variant A.
      const members = steps
        .filter((x) => x.variantGroupId === s.variantGroupId)
        .sort((a, b) => (/(variant)/i.test(a.name) ? 1 : 0) - (/(variant)/i.test(b.name) ? 1 : 0));
      groups.push({ key: s.variantGroupId, nodes: members, isVariant: members.length > 1 });
    } else {
      groups.push({ key: s.id, nodes: [s], isVariant: false });
    }
  }
  return groups;
}

export function FunnelStepsPanel({ onClose }: { onClose?: () => void }) {
  const {
    data,
    selectedNodeId,
    selectedElId,
    setSelectedNodeId,
    setSelectedElId,
    setData,
  } = useQuiz();
  const groups = buildGroups(topoOrderSteps(data));

  // Expansion is keyed by group key (variantGroupId or node id).
  const groupKeyOf = (nodeId: string) =>
    data.nodes[nodeId]?.kind === "step"
      ? (data.nodes[nodeId] as StepNode).variantGroupId ?? nodeId
      : nodeId;

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selectedNodeId ? [groupKeyOf(selectedNodeId)] : []),
  );
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // After adding an element we can't know its id synchronously (addSubEl mints
  // it internally), so flag the node and select its new last element once data updates.
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedNodeId) return;
    const key = groupKeyOf(selectedNodeId);
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  useEffect(() => {
    if (!pendingSelect) return;
    const node = data.nodes[pendingSelect];
    if (node && node.kind === "step" && node.subEls.length > 0) {
      const last = node.subEls[node.subEls.length - 1];
      setSelectedNodeId(pendingSelect);
      setSelectedElId(last.id);
    }
    setPendingSelect(null);
  }, [data, pendingSelect, setSelectedNodeId, setSelectedElId]);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function selectStep(id: string) {
    setSelectedNodeId(id);
    setSelectedElId(null);
  }
  function selectEl(nodeId: string, elId: string) {
    setSelectedNodeId(nodeId);
    setSelectedElId(elId);
  }
  function addElement(nodeId: string, kind: PaletteItem["kind"]) {
    setData((prev) => addSubEl(prev, nodeId, { kind }));
    setAddMenuFor(null);
    setPendingSelect(nodeId);
  }
  function deleteEl(nodeId: string, elId: string) {
    setData((prev) => removeSubEl(prev, nodeId, elId));
    if (selectedElId === elId) setSelectedElId(null);
  }
  function renameNode(nodeId: string, name: string) {
    setData((prev) => {
      const n = prev.nodes[nodeId];
      if (!n || n.kind !== "step") return prev;
      return { ...prev, nodes: { ...prev.nodes, [nodeId]: { ...n, name } } };
    });
  }
  function setVariantPct(members: StepNode[], memberId: string, pct: number) {
    const p = Math.max(0, Math.min(100, Math.round(pct) || 0));
    setData((prev) => {
      if (members.length === 2) {
        const other = members.find((m) => m.id !== memberId);
        return setTrafficSplit(prev, {
          [memberId]: p,
          ...(other ? { [other.id]: 100 - p } : {}),
        });
      }
      return setTrafficSplit(prev, { [memberId]: p });
    });
  }

  // Renders the element rows + "New element" for a single node (used by both
  // lone steps and each variant of a group).
  function elementList(node: StepNode) {
    return (
      <>
        {node.subEls.map((el) => {
          const Item = ITEM_BY_KIND[el.kind];
          const Icon = Item?.Icon;
          const isSel = selectedElId === el.id && selectedNodeId === node.id;
          return (
            <div
              key={el.id}
              className={`group flex items-center rounded-md transition-colors ${
                isSel ? "bg-indigo-100" : "hover:bg-gray-50"
              }`}
            >
              <button
                type="button"
                onClick={() => selectEl(node.id, el.id)}
                className="flex-1 flex items-center gap-1.5 px-2 py-1.5 text-left min-w-0"
              >
                {Icon && (
                  <Icon size={13} className={`shrink-0 ${isSel ? "text-indigo-600" : "text-gray-400"}`} />
                )}
                <span className={`text-xs font-medium shrink-0 ${isSel ? "text-indigo-800" : "text-gray-600"}`}>
                  {kindLabel(el.kind)}
                </span>
                <span className="text-xs text-gray-400 truncate min-w-0">{elementSummary(el)}</span>
              </button>
              <button
                type="button"
                onClick={() => deleteEl(node.id, el.id)}
                className="p-1 mr-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                aria-label="Delete element"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
        {node.subEls.length === 0 && (
          <p className="text-xs text-gray-400 italic px-2 py-1">No elements yet</p>
        )}
        {/* + New Element */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddMenuFor((cur) => (cur === node.id ? null : node.id))}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            <Plus size={13} />
            New element
          </button>
          {addMenuFor === node.id && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAddMenuFor(null)} />
              <div className="absolute z-20 left-2 mt-0.5 w-44 bg-white border border-gray-200 rounded-md shadow-lg py-1">
                {PALETTE_ITEMS.map(({ kind, label, Icon }) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addElement(node.id, kind)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                  >
                    <Icon size={14} className="text-gray-400" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <aside className="w-[280px] border-r border-gray-200 bg-white shrink-0 flex flex-col min-h-0">
      <div className="h-10 pl-4 pr-2 flex items-center justify-between border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-800">Funnel Steps</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
            aria-label="Close Funnel Steps panel"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-2 py-3">No steps yet</p>
        ) : (
          <ol className="space-y-0.5">
            {groups.map((group, i) => {
              const isOpen = expanded.has(group.key);
              const lone = group.nodes[0];
              const loneSelected =
                !group.isVariant && selectedNodeId === lone.id && !selectedElId;
              const displayName = group.isVariant
                ? stripVariantSuffix(lone.name)
                : lone.name;
              return (
                <li key={group.key}>
                  {/* Step header row */}
                  <div
                    className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${
                      loneSelected ? "bg-indigo-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.key)}
                      className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span
                      className={`text-xs font-mono w-4 text-center shrink-0 ${
                        loneSelected ? "text-indigo-500" : "text-gray-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                    {renamingId === lone.id && !group.isVariant ? (
                      <input
                        autoFocus
                        value={lone.name}
                        onChange={(e) => renameNode(lone.id, e.target.value)}
                        onBlur={() => setRenamingId(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 min-w-0 text-sm border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => (group.isVariant ? toggleExpand(group.key) : selectStep(lone.id))}
                        onDoubleClick={() => !group.isVariant && setRenamingId(lone.id)}
                        className="flex-1 py-2 text-left min-w-0"
                        title={group.isVariant ? undefined : "Double-click to rename"}
                      >
                        <span
                          className={`text-sm truncate ${
                            loneSelected ? "text-indigo-900 font-medium" : "text-gray-700"
                          }`}
                        >
                          {displayName}
                        </span>
                      </button>
                    )}
                    {group.isVariant && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded shrink-0">
                        A/B
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  {isOpen && (
                    <div className="ml-4 mt-0.5 mb-1 pl-2 border-l border-gray-100 space-y-0.5">
                      {group.isVariant
                        ? group.nodes.map((m, vi) => {
                            const variantSelected = selectedNodeId === m.id && !selectedElId;
                            return (
                              <div key={m.id} className="mb-1">
                                {/* Variant sub-header */}
                                <div
                                  className={`flex items-center justify-between gap-2 rounded-md pl-1 pr-1.5 ${
                                    variantSelected ? "bg-indigo-50" : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => selectStep(m.id)}
                                    className={`flex items-center gap-1.5 py-1 text-left min-w-0 ${
                                      variantSelected
                                        ? "text-indigo-800 font-semibold"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    <span className="text-xs font-semibold">
                                      Variant {String.fromCharCode(65 + vi)}
                                    </span>
                                    <span className="text-[10px] text-gray-400 truncate">
                                      {stripVariantSuffix(m.name) !== displayName ? m.name : ""}
                                    </span>
                                  </button>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={m.trafficPct ?? 0}
                                      onChange={(e) =>
                                        setVariantPct(group.nodes, m.id, Number(e.target.value))
                                      }
                                      className="w-11 text-xs text-right border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    />
                                    <span className="text-[10px] text-gray-400">%</span>
                                  </div>
                                </div>
                                {/* Variant elements */}
                                <div className="ml-2 pl-2 border-l border-gray-100 space-y-0.5">
                                  {elementList(m)}
                                </div>
                              </div>
                            );
                          })
                        : elementList(lone)}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
