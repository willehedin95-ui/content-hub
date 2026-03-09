"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";

function parsePx(v: string): string {
  const n = parseInt(v);
  return isNaN(n) ? "0" : String(n);
}

function validateNumber(value: string): string {
  // Remove non-numeric characters except minus sign
  const cleaned = value.replace(/[^0-9-]/g, "");
  const num = parseInt(cleaned);
  return isNaN(num) ? "" : String(num);
}

export default function SpacingControl() {
  const { selectedElRef, iframeRef, markDirty, pushUndoSnapshot, hasSelectedEl, layersRefreshKey } = useBuilder();

  const [marginTop, setMarginTop] = useState("");
  const [marginRight, setMarginRight] = useState("");
  const [marginBottom, setMarginBottom] = useState("");
  const [marginLeft, setMarginLeft] = useState("");
  const [paddingTop, setPaddingTop] = useState("");
  const [paddingRight, setPaddingRight] = useState("");
  const [paddingBottom, setPaddingBottom] = useState("");
  const [paddingLeft, setPaddingLeft] = useState("");

  const [marginHV, setMarginHV] = useState(false);
  const [paddingHV, setPaddingHV] = useState(false);

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

  // Sync values from selected element
  useEffect(() => {
    if (!hasSelectedEl) return;
    setMarginTop(parsePx(getComputedValue("margin-top")));
    setMarginRight(parsePx(getComputedValue("margin-right")));
    setMarginBottom(parsePx(getComputedValue("margin-bottom")));
    setMarginLeft(parsePx(getComputedValue("margin-left")));
    setPaddingTop(parsePx(getComputedValue("padding-top")));
    setPaddingRight(parsePx(getComputedValue("padding-right")));
    setPaddingBottom(parsePx(getComputedValue("padding-bottom")));
    setPaddingLeft(parsePx(getComputedValue("padding-left")));
  }, [hasSelectedEl, layersRefreshKey, getComputedValue]);

  function applyStyle(prop: string, value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    el.style.setProperty(prop, value);
  }

  function handleMarginChange(side: "top" | "right" | "bottom" | "left", value: string) {
    const validated = validateNumber(value);
    const px = validated === "" ? "0" : validated;
    const val = `${px}px`;

    // Push single undo snapshot for the entire operation
    pushUndoSnapshot();

    if (side === "top") {
      setMarginTop(px);
      applyStyle("margin-top", val);
      if (marginHV) {
        setMarginBottom(px);
        applyStyle("margin-bottom", val);
      }
    } else if (side === "bottom") {
      setMarginBottom(px);
      applyStyle("margin-bottom", val);
      if (marginHV) {
        setMarginTop(px);
        applyStyle("margin-top", val);
      }
    } else if (side === "left") {
      setMarginLeft(px);
      applyStyle("margin-left", val);
      if (marginHV) {
        setMarginRight(px);
        applyStyle("margin-right", val);
      }
    } else {
      setMarginRight(px);
      applyStyle("margin-right", val);
      if (marginHV) {
        setMarginLeft(px);
        applyStyle("margin-left", val);
      }
    }

    // Mark dirty once after all changes
    markDirty();
  }

  function handlePaddingChange(side: "top" | "right" | "bottom" | "left", value: string) {
    const validated = validateNumber(value);
    const px = validated === "" ? "0" : validated;
    const val = `${px}px`;

    // Push single undo snapshot for the entire operation
    pushUndoSnapshot();

    if (side === "top") {
      setPaddingTop(px);
      applyStyle("padding-top", val);
      if (paddingHV) {
        setPaddingBottom(px);
        applyStyle("padding-bottom", val);
      }
    } else if (side === "bottom") {
      setPaddingBottom(px);
      applyStyle("padding-bottom", val);
      if (paddingHV) {
        setPaddingTop(px);
        applyStyle("padding-top", val);
      }
    } else if (side === "left") {
      setPaddingLeft(px);
      applyStyle("padding-left", val);
      if (paddingHV) {
        setPaddingRight(px);
        applyStyle("padding-right", val);
      }
    } else {
      setPaddingRight(px);
      applyStyle("padding-right", val);
      if (paddingHV) {
        setPaddingLeft(px);
        applyStyle("padding-left", val);
      }
    }

    // Mark dirty once after all changes
    markDirty();
  }

  const inputClass =
    "w-12 text-center text-[10px] border border-gray-200 rounded py-0.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400";

  return (
    <div className="space-y-3">
      {/* Margin */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Margin</span>
          <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={marginHV}
              onChange={(e) => setMarginHV(e.target.checked)}
              className="w-3 h-3 rounded"
            />
            HV
          </label>
        </div>
        <div className="flex flex-col items-center gap-1">
          <input
            type="number"
            value={marginTop}
            onChange={(e) => handleMarginChange("top", e.target.value)}
            className={inputClass}
            title="margin-top"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={marginLeft}
              onChange={(e) => handleMarginChange("left", e.target.value)}
              className={inputClass}
              title="margin-left"
            />
            <div className="w-16 h-10 rounded border border-dashed border-gray-300 flex items-center justify-center text-[9px] text-gray-300">
              element
            </div>
            <input
              type="number"
              value={marginRight}
              onChange={(e) => handleMarginChange("right", e.target.value)}
              className={inputClass}
              title="margin-right"
            />
          </div>
          <input
            type="number"
            value={marginBottom}
            onChange={(e) => handleMarginChange("bottom", e.target.value)}
            className={inputClass}
            title="margin-bottom"
          />
        </div>
      </div>

      {/* Padding */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Padding</span>
          <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={paddingHV}
              onChange={(e) => setPaddingHV(e.target.checked)}
              className="w-3 h-3 rounded"
            />
            HV
          </label>
        </div>
        <div className="flex flex-col items-center gap-1">
          <input
            type="number"
            value={paddingTop}
            onChange={(e) => handlePaddingChange("top", e.target.value)}
            className={inputClass}
            title="padding-top"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={paddingLeft}
              onChange={(e) => handlePaddingChange("left", e.target.value)}
              className={inputClass}
              title="padding-left"
            />
            <div className="w-16 h-10 rounded bg-indigo-50 border border-indigo-200 flex items-center justify-center text-[9px] text-indigo-300">
              content
            </div>
            <input
              type="number"
              value={paddingRight}
              onChange={(e) => handlePaddingChange("right", e.target.value)}
              className={inputClass}
              title="padding-right"
            />
          </div>
          <input
            type="number"
            value={paddingBottom}
            onChange={(e) => handlePaddingChange("bottom", e.target.value)}
            className={inputClass}
            title="padding-bottom"
          />
        </div>
      </div>
    </div>
  );
}
