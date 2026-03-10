"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";
import ColorPicker, { rgbToHex } from "./ColorPicker";

const BORDER_STYLES = ["none", "solid", "dashed", "dotted"];

function parsePx(v: string): string {
  const n = parseFloat(v);
  return isNaN(n) ? "0" : String(Math.round(n));
}

export default function BorderControl() {
  const { selectedElRef, iframeRef, markDirty, pushUndoSnapshot, hasSelectedEl, layersRefreshKey } = useBuilder();

  // Border
  const [uniform, setUniform] = useState(true);
  const [borderWidth, setBorderWidth] = useState("0");
  const [borderStyle, setBorderStyle] = useState("none");
  const [borderColor, setBorderColor] = useState("#000000");

  const [borderTopW, setBorderTopW] = useState("0");
  const [borderRightW, setBorderRightW] = useState("0");
  const [borderBottomW, setBorderBottomW] = useState("0");
  const [borderLeftW, setBorderLeftW] = useState("0");

  // Border radius
  const [radiusUniform, setRadiusUniform] = useState(true);
  const [borderRadius, setBorderRadius] = useState("0");
  const [radiusTL, setRadiusTL] = useState("0");
  const [radiusTR, setRadiusTR] = useState("0");
  const [radiusBR, setRadiusBR] = useState("0");
  const [radiusBL, setRadiusBL] = useState("0");

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

    const tw = parsePx(getComputedValue("border-top-width"));
    const rw = parsePx(getComputedValue("border-right-width"));
    const bw = parsePx(getComputedValue("border-bottom-width"));
    const lw = parsePx(getComputedValue("border-left-width"));

    setBorderTopW(tw);
    setBorderRightW(rw);
    setBorderBottomW(bw);
    setBorderLeftW(lw);

    const allSame = tw === rw && rw === bw && bw === lw;
    setUniform(allSame);
    if (allSame) setBorderWidth(tw);

    setBorderStyle(getComputedValue("border-top-style") || "none");
    setBorderColor(rgbToHex(getComputedValue("border-top-color")));

    // Radius
    const rtl = parsePx(getComputedValue("border-top-left-radius"));
    const rtr = parsePx(getComputedValue("border-top-right-radius"));
    const rbr = parsePx(getComputedValue("border-bottom-right-radius"));
    const rbl = parsePx(getComputedValue("border-bottom-left-radius"));

    setRadiusTL(rtl);
    setRadiusTR(rtr);
    setRadiusBR(rbr);
    setRadiusBL(rbl);

    const radSame = rtl === rtr && rtr === rbr && rbr === rbl;
    setRadiusUniform(radSame);
    if (radSame) setBorderRadius(rtl);
  }, [hasSelectedEl, layersRefreshKey, getComputedValue]);

  function applyStyle(prop: string, value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.style.setProperty(prop, value);
    markDirty();
  }

  function handleUniformWidth(val: string) {
    setBorderWidth(val);
    setBorderTopW(val);
    setBorderRightW(val);
    setBorderBottomW(val);
    setBorderLeftW(val);
    applyStyle("border-width", `${val}px`);
  }

  function handlePerSideWidth(side: string, val: string) {
    const setter = { top: setBorderTopW, right: setBorderRightW, bottom: setBorderBottomW, left: setBorderLeftW }[side];
    setter?.(val);
    applyStyle(`border-${side}-width`, `${val}px`);
  }

  function handleUniformRadius(val: string) {
    setBorderRadius(val);
    setRadiusTL(val);
    setRadiusTR(val);
    setRadiusBR(val);
    setRadiusBL(val);
    applyStyle("border-radius", `${val}px`);
  }

  function handlePerCornerRadius(corner: string, val: string) {
    const map: Record<string, (v: string) => void> = {
      "top-left": setRadiusTL,
      "top-right": setRadiusTR,
      "bottom-right": setRadiusBR,
      "bottom-left": setRadiusBL,
    };
    map[corner]?.(val);
    applyStyle(`border-${corner}-radius`, `${val}px`);
  }

  const labelClass = "text-[10px] font-medium text-gray-500 mb-0.5 block";
  const inputClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400";
  const selectClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-indigo-400";
  const smallInputClass =
    "w-14 text-center text-[10px] border border-gray-200 rounded py-0.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400";

  return (
    <div className="space-y-3">
      {/* Border Width */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={labelClass}>Border Width</span>
          <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={uniform}
              onChange={(e) => setUniform(e.target.checked)}
              className="w-3 h-3 rounded"
            />
            Uniform
          </label>
        </div>
        {uniform ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={borderWidth}
              min={0}
              onChange={(e) => handleUniformWidth(e.target.value)}
              className={inputClass}
            />
            <span className="text-[10px] text-gray-400">px</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {(["top", "right", "bottom", "left"] as const).map((side) => {
              const val = { top: borderTopW, right: borderRightW, bottom: borderBottomW, left: borderLeftW }[side];
              return (
                <div key={side} className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400 w-6 capitalize">{side[0].toUpperCase()}</span>
                  <input
                    type="number"
                    value={val}
                    min={0}
                    onChange={(e) => handlePerSideWidth(side, e.target.value)}
                    className={smallInputClass}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Border Style */}
      <div>
        <label className={labelClass}>Border Style</label>
        <select
          value={borderStyle}
          onChange={(e) => {
            setBorderStyle(e.target.value);
            applyStyle("border-style", e.target.value);
          }}
          className={selectClass}
        >
          {BORDER_STYLES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Border Color */}
      <div>
        <label className={labelClass}>Border Color</label>
        <ColorPicker
          value={borderColor}
          onChange={(hex) => {
            setBorderColor(hex);
            applyStyle("border-color", hex);
          }}
        />
      </div>

      {/* Border Radius */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={labelClass}>Border Radius</span>
          <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={radiusUniform}
              onChange={(e) => setRadiusUniform(e.target.checked)}
              className="w-3 h-3 rounded"
            />
            Uniform
          </label>
        </div>
        {radiusUniform ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={borderRadius}
              min={0}
              onChange={(e) => handleUniformRadius(e.target.value)}
              className={inputClass}
            />
            <span className="text-[10px] text-gray-400">px</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {(["top-left", "top-right", "bottom-right", "bottom-left"] as const).map((corner) => {
              const val = {
                "top-left": radiusTL,
                "top-right": radiusTR,
                "bottom-right": radiusBR,
                "bottom-left": radiusBL,
              }[corner];
              const label = { "top-left": "TL", "top-right": "TR", "bottom-right": "BR", "bottom-left": "BL" }[corner];
              return (
                <div key={corner} className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400 w-6">{label}</span>
                  <input
                    type="number"
                    value={val}
                    min={0}
                    onChange={(e) => handlePerCornerRadius(corner, e.target.value)}
                    className={smallInputClass}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
