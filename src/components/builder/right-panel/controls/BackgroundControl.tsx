"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";
import ColorPicker, { rgbToHex } from "./ColorPicker";

const SIZE_OPTIONS = ["cover", "contain", "auto"];
const POSITION_OPTIONS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top left",
  "top right",
  "bottom left",
  "bottom right",
];
const REPEAT_OPTIONS = ["no-repeat", "repeat", "repeat-x", "repeat-y"];

function extractOpacity(bg: string): number {
  const match = bg.match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
  return match ? Math.round(parseFloat(match[1]) * 100) : 100;
}

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

export default function BackgroundControl() {
  const { selectedElRef, iframeRef, markDirty, pushUndoSnapshot, hasSelectedEl, layersRefreshKey } = useBuilder();

  const [bgColor, setBgColor] = useState("#ffffff");
  const [bgOpacity, setBgOpacity] = useState(100);
  const [bgImage, setBgImage] = useState("");
  const [bgSize, setBgSize] = useState("cover");
  const [bgPosition, setBgPosition] = useState("center");
  const [bgRepeat, setBgRepeat] = useState("no-repeat");

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

    const bg = getComputedValue("background-color");
    setBgColor(rgbToHex(bg));
    setBgOpacity(extractOpacity(bg));

    const imgVal = getComputedValue("background-image");
    if (imgVal && imgVal !== "none") {
      const urlMatch = imgVal.match(/url\(["']?([^"')]+)["']?\)/);
      setBgImage(urlMatch ? urlMatch[1] : "");
    } else {
      setBgImage("");
    }

    setBgSize(getComputedValue("background-size") || "cover");
    setBgPosition(getComputedValue("background-position") || "center");
    setBgRepeat(getComputedValue("background-repeat") || "no-repeat");
  }, [hasSelectedEl, layersRefreshKey, getComputedValue]);

  function applyStyle(prop: string, value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.style.setProperty(prop, value);
    markDirty();
  }

  function handleColorChange(hex: string, opacity: number) {
    setBgColor(hex);
    setBgOpacity(opacity);
    applyStyle("background-color", hexToRgba(hex, opacity));
  }

  const labelClass = "text-[10px] font-medium text-gray-500 mb-0.5 block";
  const inputClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400";
  const selectClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-indigo-400";

  return (
    <div className="space-y-2.5">
      {/* Background Color */}
      <div>
        <label className={labelClass}>Background Color</label>
        <ColorPicker
          value={bgColor}
          onChange={(hex) => handleColorChange(hex, bgOpacity)}
          showOpacity
          opacity={bgOpacity}
          onOpacityChange={(v) => handleColorChange(bgColor, v)}
        />
      </div>

      {/* Background Image URL */}
      <div>
        <label className={labelClass}>Background Image URL</label>
        <input
          type="text"
          value={bgImage}
          onChange={(e) => {
            setBgImage(e.target.value);
            if (e.target.value) {
              applyStyle("background-image", `url(${e.target.value})`);
            } else {
              applyStyle("background-image", "none");
            }
          }}
          className={inputClass}
          placeholder="https://..."
        />
      </div>

      {/* Background Size */}
      <div>
        <label className={labelClass}>Size</label>
        <select
          value={bgSize}
          onChange={(e) => {
            setBgSize(e.target.value);
            applyStyle("background-size", e.target.value);
          }}
          className={selectClass}
        >
          {SIZE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {/* Background Position */}
      <div>
        <label className={labelClass}>Position</label>
        <select
          value={bgPosition}
          onChange={(e) => {
            setBgPosition(e.target.value);
            applyStyle("background-position", e.target.value);
          }}
          className={selectClass}
        >
          {POSITION_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {/* Background Repeat */}
      <div>
        <label className={labelClass}>Repeat</label>
        <select
          value={bgRepeat}
          onChange={(e) => {
            setBgRepeat(e.target.value);
            applyStyle("background-repeat", e.target.value);
          }}
          className={selectClass}
        >
          {REPEAT_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
