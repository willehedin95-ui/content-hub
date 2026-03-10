"use client";

import { useState, useEffect, useCallback } from "react";

export const PRESET_COLORS = [
  "#000000", "#ffffff", "#1f2937", "#374151", "#6b7280",
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e",
];

export function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return "#000000";
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

const RECENT_KEY = "content-hub-recent-colors";

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  showOpacity?: boolean;
  opacity?: number;
  onOpacityChange?: (v: number) => void;
}

export default function ColorPicker({ value, onChange, showOpacity, opacity, onOpacityChange }: ColorPickerProps) {
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [hexInput, setHexInput] = useState(value);

  // Sync hexInput when value prop changes
  useEffect(() => { setHexInput(value); }, [value]);

  // Load recent colors from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (Array.isArray(stored)) setRecentColors(stored.slice(0, 12));
    } catch {}
  }, []);

  const addRecent = useCallback((hex: string) => {
    const lower = hex.toLowerCase();
    if (PRESET_COLORS.includes(lower)) return; // don't duplicate presets
    setRecentColors(prev => {
      const next = [lower, ...prev.filter(c => c !== lower)].slice(0, 12);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  function handleChange(hex: string) {
    setHexInput(hex);
    onChange(hex);
    addRecent(hex);
  }

  function handleHexInput(v: string) {
    setHexInput(v);
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
      onChange(v);
      addRecent(v);
    }
  }

  const swatchClass = (c: string) =>
    `w-5 h-5 rounded-sm border transition-all ${
      value.toLowerCase() === c.toLowerCase()
        ? "border-indigo-500 ring-1 ring-indigo-300"
        : "border-gray-200 hover:border-gray-400"
    }`;

  return (
    <div>
      {/* Color input + hex */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0"
        />
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexInput(e.target.value)}
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
          placeholder="#000000"
        />
      </div>

      {/* Preset swatches */}
      <div className="flex flex-wrap gap-1 mt-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => handleChange(c)}
            className={swatchClass(c)}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>

      {/* Recent colors */}
      {recentColors.length > 0 && (
        <>
          <p className="text-[10px] text-gray-400 mt-2 mb-0.5">Recent</p>
          <div className="flex flex-wrap gap-1">
            {recentColors.map((c) => (
              <button
                key={c}
                onClick={() => handleChange(c)}
                className={swatchClass(c)}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </>
      )}

      {/* Opacity slider (optional) */}
      {showOpacity && opacity !== undefined && onOpacityChange && (
        <div className="mt-2">
          <label className="text-[10px] font-medium text-gray-500 mb-0.5 block">
            Opacity ({opacity}%)
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => onOpacityChange(parseInt(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
        </div>
      )}
    </div>
  );
}
