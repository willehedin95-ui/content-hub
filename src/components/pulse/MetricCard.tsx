"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "stable" | null;
  trendLabel?: string;
  trendPositive?: "up" | "down"; // Which direction is "good"? Default: "up"
  icon?: React.ReactNode;
}

export default function MetricCard({ label, value, subtitle, trend, trendLabel, trendPositive = "up", icon }: MetricCardProps) {
  const isGood = trend === null || trend === undefined ? null
    : trend === "stable" ? null
    : trend === trendPositive;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {(subtitle || trend) && (
        <div className="flex items-center gap-1.5 mt-1">
          {trend && trend !== "stable" && (
            <span className={isGood ? "text-green-600" : "text-red-600"}>
              {trend === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </span>
          )}
          {trend === "stable" && <Minus className="w-4 h-4 text-gray-400" />}
          <span className="text-sm text-gray-500">{trendLabel || subtitle}</span>
        </div>
      )}
    </div>
  );
}
