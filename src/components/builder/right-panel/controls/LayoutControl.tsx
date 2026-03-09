"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";
import { ArrowRight, ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";

const DISPLAY_OPTIONS = [
  "block",
  "flex",
  "inline-flex",
  "grid",
  "inline",
  "inline-block",
  "none",
];

const JUSTIFY_OPTIONS = [
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
];

const ALIGN_OPTIONS = ["flex-start", "center", "flex-end", "stretch", "baseline"];

const WRAP_OPTIONS = ["nowrap", "wrap", "wrap-reverse"];

const FLEX_DIRECTION_BUTTONS = [
  { value: "row", icon: ArrowRight, label: "Row" },
  { value: "column", icon: ArrowDown, label: "Column" },
  { value: "row-reverse", icon: ArrowLeft, label: "Row Rev" },
  { value: "column-reverse", icon: ArrowUp, label: "Col Rev" },
];

export default function LayoutControl() {
  const { selectedElRef, iframeRef, markDirty, pushUndoSnapshot, hasSelectedEl, layersRefreshKey } = useBuilder();

  const [display, setDisplay] = useState("block");
  const [flexDirection, setFlexDirection] = useState("row");
  const [justifyContent, setJustifyContent] = useState("flex-start");
  const [alignItems, setAlignItems] = useState("stretch");
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
    setAlignItems(getComputedValue("align-items") || "stretch");
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

          {/* Justify Content */}
          <div>
            <label className={labelClass}>Justify Content</label>
            <select
              value={justifyContent}
              onChange={(e) => {
                setJustifyContent(e.target.value);
                applyStyle("justify-content", e.target.value);
              }}
              className={selectClass}
            >
              {JUSTIFY_OPTIONS.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          {/* Align Items */}
          <div>
            <label className={labelClass}>Align Items</label>
            <select
              value={alignItems}
              onChange={(e) => {
                setAlignItems(e.target.value);
                applyStyle("align-items", e.target.value);
              }}
              className={selectClass}
            >
              {ALIGN_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
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

          {/* Flex Wrap */}
          <div>
            <label className={labelClass}>Wrap</label>
            <select
              value={flexWrap}
              onChange={(e) => {
                setFlexWrap(e.target.value);
                applyStyle("flex-wrap", e.target.value);
              }}
              className={selectClass}
            >
              {WRAP_OPTIONS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
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
