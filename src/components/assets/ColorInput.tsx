"use client";

import { cn } from "@/lib/utils";
import { BRAND_COLOR_SWATCHES } from "@/lib/post-production";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Optional override - defaults to BRAND_COLOR_SWATCHES. */
  swatches?: { value: string; label: string }[];
}

/** Color picker with: native color input + hex text input + brand-color
 *  swatch row underneath. User can always type a hex code directly. */
export default function ColorInput({ value, onChange, swatches }: Props) {
  const list = swatches ?? BRAND_COLOR_SWATCHES;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-gray-200 cursor-pointer shrink-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono"
        />
      </div>
      <div className="flex gap-1.5">
        {list.map((s) => {
          const isActive = value.toLowerCase() === s.value.toLowerCase();
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
              title={`${s.label} (${s.value})`}
              aria-label={`Set color to ${s.label}`}
              className={cn(
                "w-5 h-5 rounded-full border transition-shadow",
                isActive
                  ? "border-indigo-500 ring-2 ring-indigo-200"
                  : "border-gray-300 hover:border-gray-500",
              )}
              style={{ backgroundColor: s.value }}
            />
          );
        })}
      </div>
    </div>
  );
}
