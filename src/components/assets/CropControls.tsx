"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_HALF_CROP,
  type CropSettings,
  type HalfCrop,
} from "@/lib/post-production";

interface Props {
  crop: CropSettings;
  onChange: (next: CropSettings) => void;
}

function HalfBlock({
  title,
  value,
  onChange,
  onReset,
}: {
  title: string;
  value: HalfCrop;
  onChange: (next: HalfCrop) => void;
  onReset: () => void;
}) {
  const set = useCallback(
    (patch: Partial<HalfCrop>) => onChange({ ...value, ...patch }),
    [value, onChange],
  );
  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">{title}</span>
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
        >
          Reset
        </button>
      </div>
      <div>
        <div className="flex justify-between items-baseline text-[10px] mb-0.5">
          <span className="text-gray-600">Zoom</span>
          <span className="text-gray-500 font-mono tabular-nums">
            {value.zoom.toFixed(2)}x
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={value.zoom}
          onChange={(e) => set({ zoom: Number(e.target.value) })}
          className="w-full accent-indigo-600 cursor-pointer"
        />
      </div>
      <div>
        <div className="flex justify-between items-baseline text-[10px] mb-0.5">
          <span className="text-gray-600">Pan X</span>
          <span className="text-gray-500 font-mono tabular-nums">
            {value.panX > 0 ? "+" : ""}{Math.round(value.panX * 100)}
          </span>
        </div>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={value.panX}
          onChange={(e) => set({ panX: Number(e.target.value) })}
          disabled={value.zoom <= 1.001}
          className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
        />
      </div>
      <div>
        <div className="flex justify-between items-baseline text-[10px] mb-0.5">
          <span className="text-gray-600">Pan Y</span>
          <span className="text-gray-500 font-mono tabular-nums">
            {value.panY > 0 ? "+" : ""}{Math.round(value.panY * 100)}
          </span>
        </div>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={value.panY}
          onChange={(e) => set({ panY: Number(e.target.value) })}
          disabled={value.zoom <= 1.001}
          className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
        />
      </div>
    </div>
  );
}

export default function CropControls({ crop, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-xs font-medium text-gray-700">
          Enable per-half crop / zoom
        </span>
        <input
          type="checkbox"
          checked={crop.enabled}
          onChange={(e) => onChange({ ...crop, enabled: e.target.checked })}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
      </label>
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", !crop.enabled && "opacity-50 pointer-events-none")}>
        <HalfBlock
          title="BEFORE half"
          value={crop.before}
          onChange={(next) => onChange({ ...crop, before: next })}
          onReset={() => onChange({ ...crop, before: { ...DEFAULT_HALF_CROP } })}
        />
        <HalfBlock
          title="AFTER half"
          value={crop.after}
          onChange={(next) => onChange({ ...crop, after: next })}
          onReset={() => onChange({ ...crop, after: { ...DEFAULT_HALF_CROP } })}
        />
      </div>
    </div>
  );
}
