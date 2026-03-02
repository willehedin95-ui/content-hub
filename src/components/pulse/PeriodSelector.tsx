// src/components/pulse/PeriodSelector.tsx

"use client";

export type Period = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d";

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
}

export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Period)}
      className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      <option value="today">Idag</option>
      <option value="yesterday">Igår</option>
      <option value="7d">7 dagar</option>
      <option value="14d">14 dagar</option>
      <option value="30d">30 dagar</option>
      <option value="90d">90 dagar</option>
    </select>
  );
}
