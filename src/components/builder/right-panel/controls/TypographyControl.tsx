"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from "lucide-react";
import ColorPicker, { rgbToHex } from "./ColorPicker";

const WEIGHT_OPTIONS = [
  { value: "100", label: "100 - Thin" },
  { value: "200", label: "200 - Extra Light" },
  { value: "300", label: "300 - Light" },
  { value: "400", label: "Normal (400)" },
  { value: "500", label: "500 - Medium" },
  { value: "600", label: "600 - Semi Bold" },
  { value: "700", label: "Bold (700)" },
  { value: "800", label: "800 - Extra Bold" },
  { value: "900", label: "900 - Black" },
];

const DECORATION_OPTIONS = ["none", "underline", "line-through", "overline"];
const TRANSFORM_OPTIONS = ["none", "uppercase", "lowercase", "capitalize"];

const ALIGN_BUTTONS = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
  { value: "justify", icon: AlignJustify },
];

export default function TypographyControl() {
  const { selectedElRef, iframeRef, markDirty, pushUndoSnapshot, hasSelectedEl, layersRefreshKey } = useBuilder();

  const [fontSize, setFontSize] = useState("");
  const [fontWeight, setFontWeight] = useState("400");
  const [textColor, setTextColor] = useState("#000000");
  const [textAlign, setTextAlign] = useState("left");
  const [lineHeight, setLineHeight] = useState("");
  const [letterSpacing, setLetterSpacing] = useState("");
  const [textDecoration, setTextDecoration] = useState("none");
  const [textTransform, setTextTransform] = useState("none");

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

    const fs = getComputedValue("font-size");
    setFontSize(String(Math.round(parseFloat(fs) || 16)));

    const fw = getComputedValue("font-weight");
    setFontWeight(fw || "400");

    const color = getComputedValue("color");
    setTextColor(rgbToHex(color));

    setTextAlign(getComputedValue("text-align") || "left");

    const lh = getComputedValue("line-height");
    if (lh === "normal") {
      setLineHeight("1.5");
    } else {
      const fsPx = parseFloat(fs) || 16;
      const lhPx = parseFloat(lh) || fsPx * 1.5;
      setLineHeight(String(Math.round((lhPx / fsPx) * 100) / 100));
    }

    const ls = getComputedValue("letter-spacing");
    setLetterSpacing(ls === "normal" ? "0" : String(Math.round(parseFloat(ls) || 0)));

    const td = getComputedValue("text-decoration-line") || getComputedValue("text-decoration");
    setTextDecoration(td?.split(" ")[0] || "none");

    setTextTransform(getComputedValue("text-transform") || "none");
  }, [hasSelectedEl, layersRefreshKey, getComputedValue]);

  function applyStyle(prop: string, value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.style.setProperty(prop, value);
    markDirty();
  }

  const labelClass = "text-[10px] font-medium text-gray-500 mb-0.5 block";
  const inputClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400";
  const selectClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-indigo-400";

  return (
    <div className="space-y-2.5">
      {/* Font Size & Weight */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Font Size</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={fontSize}
              onChange={(e) => {
                setFontSize(e.target.value);
                const el = selectedElRef.current;
                if (!el) return;
                pushUndoSnapshot();
                if (e.target.value === "") {
                  el.style.removeProperty("font-size");
                } else {
                  el.style.setProperty("font-size", `${e.target.value}px`);
                }
                markDirty();
              }}
              className={inputClass}
              min={1}
            />
            <span className="text-[10px] text-gray-400">px</span>
          </div>
        </div>
        <div>
          <label className={labelClass}>Weight</label>
          <select
            value={fontWeight}
            onChange={(e) => {
              setFontWeight(e.target.value);
              applyStyle("font-weight", e.target.value);
            }}
            className={selectClass}
          >
            {WEIGHT_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Text Color */}
      <div>
        <label className={labelClass}>Text Color</label>
        <ColorPicker
          value={textColor}
          onChange={(hex) => {
            setTextColor(hex);
            applyStyle("color", hex);
          }}
        />
      </div>

      {/* Text Alignment */}
      <div>
        <label className={labelClass}>Alignment</label>
        <div className="flex gap-0.5 bg-gray-100 rounded p-0.5">
          {ALIGN_BUTTONS.map((btn) => (
            <button
              key={btn.value}
              onClick={() => {
                setTextAlign(btn.value);
                applyStyle("text-align", btn.value);
              }}
              className={`flex-1 flex items-center justify-center py-1.5 rounded text-xs transition-colors ${
                textAlign === btn.value
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              title={btn.value}
            >
              <btn.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* Line Height & Letter Spacing */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Line Height</label>
          <input
            type="number"
            value={lineHeight}
            step={0.1}
            min={0}
            onChange={(e) => {
              setLineHeight(e.target.value);
              const el = selectedElRef.current;
              if (!el) return;
              pushUndoSnapshot();
              if (e.target.value === "") {
                el.style.removeProperty("line-height");
              } else {
                el.style.setProperty("line-height", e.target.value);
              }
              markDirty();
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Letter Spacing</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={letterSpacing}
              onChange={(e) => {
                setLetterSpacing(e.target.value);
                applyStyle("letter-spacing", `${e.target.value || 0}px`);
              }}
              className={inputClass}
            />
            <span className="text-[10px] text-gray-400">px</span>
          </div>
        </div>
      </div>

      {/* Text Decoration & Transform */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Decoration</label>
          <select
            value={textDecoration}
            onChange={(e) => {
              setTextDecoration(e.target.value);
              applyStyle("text-decoration", e.target.value);
            }}
            className={selectClass}
          >
            {DECORATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Transform</label>
          <select
            value={textTransform}
            onChange={(e) => {
              setTextTransform(e.target.value);
              applyStyle("text-transform", e.target.value);
            }}
            className={selectClass}
          >
            {TRANSFORM_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
