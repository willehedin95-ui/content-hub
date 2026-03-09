"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";
import { Plus, Trash2 } from "lucide-react";

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return "#000000";
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

interface Shadow {
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
}

function parseShadow(raw: string): Shadow | null {
  if (!raw || raw === "none") return null;
  // Try to parse "rgb(r,g,b) Xpx Ypx Bpx Spx" or "Xpx Ypx Bpx Spx rgb(r,g,b)"
  const rgbMatch = raw.match(/rgba?\([^)]+\)/);
  const color = rgbMatch ? rgbToHex(rgbMatch[0]) : "#000000";
  const withoutColor = raw.replace(/rgba?\([^)]+\)/, "").trim();
  const parts = withoutColor.split(/\s+/).map((p) => String(parseFloat(p) || 0));
  return {
    x: parts[0] || "0",
    y: parts[1] || "0",
    blur: parts[2] || "0",
    spread: parts[3] || "0",
    color,
  };
}

function buildShadowString(s: Shadow): string {
  return `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
}

export default function EffectsControl() {
  const { selectedElRef, iframeRef, markDirty, pushUndoSnapshot, hasSelectedEl, layersRefreshKey } = useBuilder();

  const [hasShadow, setHasShadow] = useState(false);
  const [shadow, setShadow] = useState<Shadow>({
    x: "0",
    y: "2",
    blur: "8",
    spread: "0",
    color: "#000000",
  });
  const [opacity, setOpacity] = useState(100);

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

    const bs = getComputedValue("box-shadow");
    const parsed = parseShadow(bs);
    if (parsed) {
      setHasShadow(true);
      setShadow(parsed);
    } else {
      setHasShadow(false);
    }

    const op = getComputedValue("opacity");
    setOpacity(Math.round((parseFloat(op) || 1) * 100));
  }, [hasSelectedEl, layersRefreshKey, getComputedValue]);

  function applyStyle(prop: string, value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.style.setProperty(prop, value);
    markDirty();
  }

  function updateShadow(partial: Partial<Shadow>) {
    const next = { ...shadow, ...partial };
    setShadow(next);
    applyStyle("box-shadow", buildShadowString(next));
  }

  function addShadow() {
    setHasShadow(true);
    const defaults: Shadow = { x: "0", y: "2", blur: "8", spread: "0", color: "#000000" };
    setShadow(defaults);
    applyStyle("box-shadow", buildShadowString(defaults));
  }

  function removeShadow() {
    setHasShadow(false);
    applyStyle("box-shadow", "none");
  }

  const labelClass = "text-[10px] font-medium text-gray-500 mb-0.5 block";
  const inputClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400";

  return (
    <div className="space-y-3">
      {/* Box Shadow */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-gray-500 uppercase">Box Shadow</span>
          {hasShadow ? (
            <button
              onClick={removeShadow}
              className="flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          ) : (
            <button
              onClick={addShadow}
              className="flex items-center gap-0.5 text-[10px] text-indigo-600 hover:text-indigo-800"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
        </div>
        {hasShadow && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-4 gap-1">
              <div>
                <label className="text-[9px] text-gray-400 block text-center">X</label>
                <input
                  type="number"
                  value={shadow.x}
                  onChange={(e) => updateShadow({ x: e.target.value })}
                  className="w-full text-center text-[10px] border border-gray-200 rounded py-0.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-400 block text-center">Y</label>
                <input
                  type="number"
                  value={shadow.y}
                  onChange={(e) => updateShadow({ y: e.target.value })}
                  className="w-full text-center text-[10px] border border-gray-200 rounded py-0.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-400 block text-center">Blur</label>
                <input
                  type="number"
                  value={shadow.blur}
                  min={0}
                  onChange={(e) => updateShadow({ blur: e.target.value })}
                  className="w-full text-center text-[10px] border border-gray-200 rounded py-0.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-400 block text-center">Spread</label>
                <input
                  type="number"
                  value={shadow.spread}
                  onChange={(e) => updateShadow({ spread: e.target.value })}
                  className="w-full text-center text-[10px] border border-gray-200 rounded py-0.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={shadow.color}
                onChange={(e) => updateShadow({ color: e.target.value })}
                className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0"
              />
              <input
                type="text"
                value={shadow.color}
                onChange={(e) => {
                  if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                    updateShadow({ color: e.target.value });
                  }
                }}
                className={`${inputClass} flex-1`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Opacity */}
      <div>
        <label className={labelClass}>Opacity ({opacity}%)</label>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            setOpacity(val);
            applyStyle("opacity", String(val / 100));
          }}
          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
      </div>
    </div>
  );
}
