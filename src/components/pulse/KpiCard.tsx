// src/components/pulse/KpiCard.tsx

"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, AlertCircle, AlertTriangle } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  changePercent?: number | null;
  sparklineData?: Array<{ date: string; value: number }>;
  subtitle?: string;
  status?: "healthy" | "warning" | "critical";
}

export default function KpiCard({
  label,
  value,
  changePercent,
  sparklineData,
  subtitle,
  status,
}: KpiCardProps) {
  const hasChange = changePercent !== null && changePercent !== undefined && Number.isFinite(changePercent);
  const isPositive = hasChange && changePercent > 0;
  const isNegative = hasChange && changePercent < 0;

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-5"
      role="region"
      aria-label={`${label}: ${value}${hasChange ? `, ${isPositive ? "up" : isNegative ? "down" : "unchanged"} ${Math.abs(changePercent).toFixed(1)}%` : ""}`}
    >
      {/* Label */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {status === "critical" && (
          <AlertCircle className="w-4 h-4 text-red-500" />
        )}
        {status === "warning" && (
          <AlertTriangle className="w-4 h-4 text-amber-500" />
        )}
      </div>

      {/* Value */}
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>

      {/* Change indicator */}
      {hasChange && (
        <div className="flex items-center gap-1 mb-3">
          {isPositive && <TrendingUp className="w-4 h-4 text-green-600" />}
          {isNegative && <TrendingDown className="w-4 h-4 text-red-600" />}
          <span
            className={`text-sm font-medium ${
              isPositive ? "text-green-600" : isNegative ? "text-red-600" : "text-gray-500"
            }`}
          >
            {isPositive ? "+" : ""}
            {changePercent.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Subtitle */}
      {subtitle && !hasChange && (
        <p className="text-sm text-gray-500 mb-3">{subtitle}</p>
      )}

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="h-12 mt-2" role="img" aria-label={`Trend visualization for ${label}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={isPositive ? "#16a34a" : isNegative ? "#dc2626" : "#2563eb"}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Subtitle after sparkline if change exists */}
      {subtitle && hasChange && (
        <p className="text-xs text-gray-400 mt-2">{subtitle}</p>
      )}
    </div>
  );
}
