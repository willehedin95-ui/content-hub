// src/components/pulse/PeriodSelector.tsx

"use client";

export type Period = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d";

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export default function PeriodSelector({
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel = 'Select time period'
}: PeriodSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Period)}
      disabled={disabled}
      aria-label={ariaLabel}
      className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="today">Today</option>
      <option value="yesterday">Yesterday</option>
      <option value="7d">7 days</option>
      <option value="14d">14 days</option>
      <option value="30d">30 days</option>
      <option value="90d">90 days</option>
    </select>
  );
}
