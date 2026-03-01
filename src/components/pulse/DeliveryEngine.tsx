"use client";

import { useEffect, useState } from "react";
import { Truck, AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { DeliveryData, StockItem } from "@/app/api/pulse/delivery/route";

function statusIcon(status: StockItem["status"]) {
  switch (status) {
    case "critical":
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case "healthy":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    default:
      return <span className="w-4 h-4 inline-block rounded-full bg-gray-300" />;
  }
}

function statusBadge(status: StockItem["status"]) {
  switch (status) {
    case "critical":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          Kritisk
        </span>
      );
    case "warning":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          Varning
        </span>
      );
    case "healthy":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          OK
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          Okänd
        </span>
      );
  }
}

export default function DeliveryEngine() {
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/pulse/delivery");
        if (!res.ok) throw new Error("Failed to fetch delivery data");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const criticalCount = data?.items.filter((i) => i.status === "critical").length ?? 0;
  const warningCount = data?.items.filter((i) => i.status === "warning").length ?? 0;

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <Truck className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Delivery Engine</h2>
        {data && !loading && (criticalCount > 0 || warningCount > 0) && (
          <div className="flex items-center gap-2 ml-2">
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                <AlertCircle className="w-3.5 h-3.5" /> {criticalCount} kritisk{criticalCount > 1 ? "a" : ""}
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" /> {warningCount} varning{warningCount > 1 ? "ar" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Shopify not configured */}
      {data && !loading && data.items.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start gap-2">
          <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-500">
            Shopify inte konfigurerat. Konfigurera Shopify-anslutning i Settings för att se lagerstatus.
          </p>
        </div>
      )}

      {/* Stock table */}
      {data && !loading && data.items.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Produkt</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Lager</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Dagar kvar</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.shopifyProductId} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-900">
                    <div className="flex items-center gap-2">
                      {statusIcon(item.status)}
                      <span>{item.shopifyTitle}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{item.totalStock}</td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                    {item.daysRemaining != null ? `${Math.round(item.daysRemaining)}d` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">{statusBadge(item.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
