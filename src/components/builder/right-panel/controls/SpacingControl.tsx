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

    pushUndoSnapshot();

    if (side === "top") {
      setMarginTop(px);
      applyStyle("margin-top", val);
    } else if (side === "bottom") {
      setMarginBottom(px);
      applyStyle("margin-bottom", val);
    } else if (side === "left") {
      setMarginLeft(px);
      applyStyle("margin-left", val);
    } else {
      setMarginRight(px);
      applyStyle("margin-right", val);
    }

    markDirty();
  }

  function handlePaddingChange(side: "top" | "right" | "bottom" | "left", value: string) {
    const validated = validateNumber(value);
    const px = validated === "" ? "0" : validated;
    const val = `${px}px`;

    pushUndoSnapshot();

    if (side === "top") {
      setPaddingTop(px);
      applyStyle("padding-top", val);
    } else if (side === "bottom") {
      setPaddingBottom(px);
      applyStyle("padding-bottom", val);
    } else if (side === "left") {
      setPaddingLeft(px);
      applyStyle("padding-left", val);
    } else {
      setPaddingRight(px);
      applyStyle("padding-right", val);
    }

    markDirty();
  }

  const inputClass =
    "w-10 text-center text-[10px] border-0 bg-transparent text-gray-600 focus:outline-none focus:bg-white focus:border focus:border-indigo-300 focus:rounded";

  return (
    <div>
      {/* Outer box — Margin */}
      <div className="bg-amber-50/50 border border-dashed border-amber-200/60 rounded-lg relative px-1 py-1.5">
        {/* M label */}
        <span className="absolute top-1 left-2 text-[8px] text-amber-400 font-semibold select-none">
          M
        </span>

        {/* Margin top */}
        <div className="flex justify-center pt-1 pb-1">
          <input
            type="number"
            value={marginTop}
            onChange={(e) => handleMarginChange("top", e.target.value)}
            className={inputClass}
            placeholder="0"
            title="margin-top"
          />
        </div>

        {/* Middle row: margin-left | padding box | margin-right */}
        <div className="flex items-center">
          {/* Margin left */}
          <div className="flex items-center justify-center w-10 shrink-0">
            <input
              type="number"
              value={marginLeft}
              onChange={(e) => handleMarginChange("left", e.target.value)}
              className={inputClass}
              placeholder="0"
              title="margin-left"
            />
          </div>

          {/* Inner box — Padding */}
          <div className="bg-indigo-50/50 border border-dashed border-indigo-200/60 rounded relative flex-1 px-1 py-1">
            {/* P label */}
            <span className="absolute top-0.5 left-1.5 text-[8px] text-indigo-400 font-semibold select-none">
              P
            </span>

            {/* Padding top */}
            <div className="flex justify-center pt-0.5 pb-0.5">
              <input
                type="number"
                value={paddingTop}
                onChange={(e) => handlePaddingChange("top", e.target.value)}
                className={inputClass}
                placeholder="0"
                title="padding-top"
              />
            </div>

            {/* Padding middle row: pl | content | pr */}
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 shrink-0">
                <input
                  type="number"
                  value={paddingLeft}
                  onChange={(e) => handlePaddingChange("left", e.target.value)}
                  className={inputClass}
                  placeholder="0"
                  title="padding-left"
                />
              </div>

              {/* Content block */}
              <div className="flex-1 min-h-[24px] bg-white rounded border border-gray-200 flex items-center justify-center">
                <span className="text-[8px] text-gray-300 select-none">content</span>
              </div>

              <div className="flex items-center justify-center w-10 shrink-0">
                <input
                  type="number"
                  value={paddingRight}
                  onChange={(e) => handlePaddingChange("right", e.target.value)}
                  className={inputClass}
                  placeholder="0"
                  title="padding-right"
                />
              </div>
            </div>

            {/* Padding bottom */}
            <div className="flex justify-center pt-0.5 pb-0.5">
              <input
                type="number"
                value={paddingBottom}
                onChange={(e) => handlePaddingChange("bottom", e.target.value)}
                className={inputClass}
                placeholder="0"
                title="padding-bottom"
              />
            </div>
          </div>

          {/* Margin right */}
          <div className="flex items-center justify-center w-10 shrink-0">
            <input
              type="number"
              value={marginRight}
              onChange={(e) => handleMarginChange("right", e.target.value)}
              className={inputClass}
              placeholder="0"
              title="margin-right"
            />
          </div>
        </div>

        {/* Margin bottom */}
        <div className="flex justify-center pt-1 pb-1">
          <input
            type="number"
            value={marginBottom}
            onChange={(e) => handleMarginChange("bottom", e.target.value)}
            className={inputClass}
            placeholder="0"
            title="margin-bottom"
          />
        </div>
      </div>
    </div>
  );
}
