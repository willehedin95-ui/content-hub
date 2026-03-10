"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";
import { ArrowRight, ArrowDown, ArrowLeft, ArrowUp, WrapText } from "lucide-react";

const DISPLAY_OPTIONS = [
  "block",
  "flex",
  "inline-flex",
  "grid",
  "inline",
  "inline-block",
  "none",
];

const FLEX_DIRECTION_BUTTONS = [
  { value: "row", icon: ArrowRight, label: "Row" },
  { value: "column", icon: ArrowDown, label: "Column" },
  { value: "row-reverse", icon: ArrowLeft, label: "Row Rev" },
  { value: "column-reverse", icon: ArrowUp, label: "Col Rev" },
];

// 3x3 alignment grid values
// Rows = cross-axis (align-items), Columns = main-axis (justify-content)
// When direction is column/column-reverse, axes swap
const ALIGNMENT_VALUES = ["flex-start", "center", "flex-end"] as const;

export default function LayoutControl() {
  const { selectedElRef, iframeRef, markDirty, pushUndoSnapshot, hasSelectedEl, layersRefreshKey } = useBuilder();

  const [display, setDisplay] = useState("block");
  const [flexDirection, setFlexDirection] = useState("row");
  const [justifyContent, setJustifyContent] = useState("flex-start");
  const [alignItems, setAlignItems] = useState("flex-start");
  const [gap, setGap] = useState("0");
  const [flexWrap, setFlexWrap] = useState("nowrap");
  const [gridCols, setGridCols] = useState("");

  const getComputedValue = useCallback(
    (prop: string): string => {
      const el = selectedElRef.current;
      if (!el) return "";
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.defaultView) return "";
      return doc.defaultView.getComputedStyle(el).getPropertyValue(prop);
    },
    [selectedElRef, iframeRef]
  );

  useEffect(() => {
    if (!hasSelectedEl) return;

    const d = getComputedValue("display");
    setDisplay(d || "block");

    setFlexDirection(getComputedValue("flex-direction") || "row");
    setJustifyContent(getComputedValue("justify-content") || "flex-start");
    setAlignItems(getComputedValue("align-items") || "flex-start");
    setFlexWrap(getComputedValue("flex-wrap") || "nowrap");

    const g = getComputedValue("gap");
    setGap(g === "normal" ? "0" : String(Math.round(parseFloat(g) || 0)));

    const gtc = getComputedValue("grid-template-columns");
    setGridCols(gtc === "none" ? "" : gtc);
  }, [hasSelectedEl, layersRefreshKey, getComputedValue]);

  function applyStyle(prop: string, value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.style.setProperty(prop, value);
    markDirty();
  }

  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid";
  const isColumnDirection = flexDirection === "column" || flexDirection === "column-reverse";
  const isSpaced = justifyContent === "space-between";

  // Normalize justify/align values to the 3 grid-compatible values for active state detection
  function normalizeToGrid(value: string): string {
    if (value === "start" || value === "flex-start") return "flex-start";
    if (value === "end" || value === "flex-end") return "flex-end";
    if (value === "center") return "center";
    // For space-between or other values, default to flex-start in the grid
    return "flex-start";
  }

  // Get which grid cell is active
  function getActiveCell(): { row: number; col: number } {
    const jNorm = normalizeToGrid(justifyContent);
    const aNorm = normalizeToGrid(alignItems);

    const jIndex = ALIGNMENT_VALUES.indexOf(jNorm as typeof ALIGNMENT_VALUES[number]);
    const aIndex = ALIGNMENT_VALUES.indexOf(aNorm as typeof ALIGNMENT_VALUES[number]);

    const mainIdx = jIndex >= 0 ? jIndex : 0;
    const crossIdx = aIndex >= 0 ? aIndex : 0;

    if (isColumnDirection) {
      // Column: columns = align-items (cross), rows = justify-content (main)
      return { row: mainIdx, col: crossIdx };
    }
    // Row: columns = justify-content (main), rows = align-items (cross)
    return { row: crossIdx, col: mainIdx };
  }

  function handleAlignmentClick(row: number, col: number) {
    let newJustify: string;
    let newAlign: string;

    if (isColumnDirection) {
      // Column: rows = justify-content, columns = align-items
      newJustify = ALIGNMENT_VALUES[row];
      newAlign = ALIGNMENT_VALUES[col];
    } else {
      // Row: columns = justify-content, rows = align-items
      newJustify = ALIGNMENT_VALUES[col];
      newAlign = ALIGNMENT_VALUES[row];
    }

    setJustifyContent(newJustify);
    setAlignItems(newAlign);
    applyStyle("justify-content", newJustify);
    applyStyle("align-items", newAlign);
  }

  function handlePackedSpacedToggle(mode: "packed" | "spaced") {
    if (mode === "spaced") {
      setJustifyContent("space-between");
      applyStyle("justify-content", "space-between");
    } else {
      // Restore justify from alignment grid position
      const active = getActiveCell();
      const newJustify = isColumnDirection
        ? ALIGNMENT_VALUES[active.row]
        : ALIGNMENT_VALUES[active.col];
      setJustifyContent(newJustify);
      applyStyle("justify-content", newJustify);
    }
  }

  const activeCell = getActiveCell();

  const labelClass = "text-[10px] font-medium text-gray-500 mb-0.5 block";
  const selectClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-indigo-400";
  const inputClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400";

  return (
    <div className="space-y-2.5">
      {/* Display */}
      <div>
        <label className={labelClass}>Display</label>
        <select
          value={display}
          onChange={(e) => {
            setDisplay(e.target.value);
            applyStyle("display", e.target.value);
          }}
          className={selectClass}
        >
          {DISPLAY_OPTIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* Flex controls */}
      {isFlex && (
        <>
          {/* Flex Direction */}
          <div>
            <label className={labelClass}>Direction</label>
            <div className="flex gap-0.5 bg-gray-100 rounded p-0.5">
              {FLEX_DIRECTION_BUTTONS.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => {
                    setFlexDirection(btn.value);
                    applyStyle("flex-direction", btn.value);
                  }}
                  className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 rounded text-[10px] transition-colors ${
                    flexDirection === btn.value
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  title={btn.label}
                >
                  <btn.icon className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>

          {/* 3x3 Alignment Grid */}
          <div>
            <label className={labelClass}>Alignment</label>
            <div className="bg-gray-50 rounded p-2">
              <div className="grid grid-cols-3 gap-1.5 w-fit mx-auto">
                {[0, 1, 2].map((row) =>
                  [0, 1, 2].map((col) => {
                    const isActive = activeCell.row === row && activeCell.col === col && !isSpaced;
                    return (
                      <button
                        key={`${row}-${col}`}
                        onClick={() => handleAlignmentClick(row, col)}
                        className={`w-4 h-4 rounded-full transition-colors ${
                          isActive
                            ? "bg-indigo-500"
                            : "bg-gray-200 hover:bg-gray-300"
                        }`}
                        title={(() => {
                          const mainLabel = ALIGNMENT_VALUES[isColumnDirection ? row : col].replace("flex-", "");
                          const crossLabel = ALIGNMENT_VALUES[isColumnDirection ? col : row].replace("flex-", "");
                          return `justify: ${mainLabel}, align: ${crossLabel}`;
                        })()}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Spacing Section */}
          <div>
            <label className={labelClass}>Spacing</label>

            {/* Packed / Spaced toggle */}
            <div className="flex gap-0.5 bg-gray-100 rounded p-0.5 mb-1.5">
              <button
                onClick={() => handlePackedSpacedToggle("packed")}
                className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-colors ${
                  !isSpaced
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Packed
              </button>
              <button
                onClick={() => handlePackedSpacedToggle("spaced")}
                className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-colors ${
                  isSpaced
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Spaced
              </button>
            </div>

            {/* Gap input + Wrap toggle — only gap visible when Packed */}
            <div className="flex items-center gap-1.5">
              {!isSpaced && (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="number"
                    value={gap}
                    min={0}
                    onChange={(e) => {
                      setGap(e.target.value);
                      applyStyle("gap", `${e.target.value}px`);
                    }}
                    className={inputClass}
                  />
                  <span className="text-[10px] text-gray-400 shrink-0">px</span>
                </div>
              )}

              {/* Wrap toggle */}
              <div className="flex gap-0.5 bg-gray-100 rounded p-0.5 shrink-0">
                <button
                  onClick={() => {
                    const newWrap = flexWrap === "wrap" ? "nowrap" : "wrap";
                    setFlexWrap(newWrap);
                    applyStyle("flex-wrap", newWrap);
                  }}
                  className={`flex items-center justify-center px-1.5 py-1.5 rounded text-[10px] transition-colors ${
                    flexWrap === "wrap"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  title={flexWrap === "wrap" ? "Wrap: on" : "Wrap: off"}
                >
                  <WrapText className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Grid controls */}
      {isGrid && (
        <>
          {/* Grid Template Columns */}
          <div>
            <label className={labelClass}>Grid Columns</label>
            <input
              type="text"
              value={gridCols}
              onChange={(e) => {
                setGridCols(e.target.value);
                applyStyle("grid-template-columns", e.target.value);
              }}
              className={inputClass}
              placeholder="1fr 1fr 1fr"
            />
          </div>

          {/* Gap */}
          <div>
            <label className={labelClass}>Gap</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={gap}
                min={0}
                onChange={(e) => {
                  setGap(e.target.value);
                  applyStyle("gap", `${e.target.value}px`);
                }}
                className={inputClass}
              />
              <span className="text-[10px] text-gray-400">px</span>
            </div>
          </div>
        </>
      )}

      {/* Info when not flex/grid */}
      {!isFlex && !isGrid && display !== "none" && (
        <p className="text-[10px] text-gray-400">
          Change display to flex or grid to see layout controls.
        </p>
      )}
    </div>
  );
}
