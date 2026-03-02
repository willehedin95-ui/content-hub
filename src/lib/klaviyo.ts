// src/lib/klaviyo.ts

export interface KlaviyoMetric {
  date: string;
  revenue: number;
}

interface KlaviyoMetricResponse {
  data: Array<{
    type: "metric";
    id: string;
    attributes: {
      name: string;
    };
  }>;
}

interface KlaviyoAggregateResponse {
  data: {
    type: "metric-aggregate";
    attributes: {
      data: Array<{
        dimensions: string[];
        measurements: {
          sum_value?: number;
        };
      }>;
    };
  };
}

export function isKlaviyoConfigured(): boolean {
  return Boolean(process.env.KLAVIYO_API_KEY);
}

async function findRevenueMetricId(apiKey: string): Promise<string | null> {
  const headers = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: "2024-10-15",
    Accept: "application/json",
  };

  try {
    // Fetch all metrics
    const response = await fetch("https://a.klaviyo.com/api/metrics", { headers });
    if (!response.ok) {
      console.error("Klaviyo metrics list error:", response.status);
      return null;
    }

    const data: KlaviyoMetricResponse = await response.json();

    // Look for revenue-related metrics (common names)
    const revenueMetricNames = [
      "Placed Order",
      "Ordered Product",
      "Order Completed",
      "Checkout Completed",
    ];

    for (const metricName of revenueMetricNames) {
      const metric = data.data.find((m) =>
        m.attributes.name.toLowerCase().includes(metricName.toLowerCase())
      );
      if (metric) {
        return metric.id;
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding Klaviyo revenue metric:", error);
    return null;
  }
}

export async function fetchKlaviyoRevenue(
  startDate: string,
  endDate: string
): Promise<{ total: number; timeseries: KlaviyoMetric[] }> {
  if (!isKlaviyoConfigured()) {
    return { total: 0, timeseries: [] };
  }

  const apiKey = process.env.KLAVIYO_API_KEY!;

  try {
    // Find the revenue metric ID
    const metricId = await findRevenueMetricId(apiKey);
    if (!metricId) {
      console.warn("No revenue metric found in Klaviyo account");
      return { total: 0, timeseries: [] };
    }

    const headers = {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: "2024-10-15",
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Query metric aggregates
    const payload = {
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          measurements: ["sum_value"],
          interval: "day",
          page_size: 500,
          timezone: "Europe/Stockholm",
          filter: [
            "greater-or-equal(datetime,datetime('" + startDate + "'))",
            "less-than(datetime,datetime('" + endDate + "'))",
          ],
        },
      },
    };

    const response = await fetch("https://a.klaviyo.com/api/metric-aggregates", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Klaviyo aggregate error:", response.status, errorText);
      return { total: 0, timeseries: [] };
    }

    const data: KlaviyoAggregateResponse = await response.json();
    const aggregateData = data.data.attributes.data;

    // Calculate total and build timeseries
    let total = 0;
    const timeseries: KlaviyoMetric[] = aggregateData.map((item) => {
      const revenue = item.measurements.sum_value ?? 0;
      total += revenue;
      return {
        date: item.dimensions[0] || startDate,
        revenue,
      };
    });

    return { total, timeseries };
  } catch (error) {
    console.error("Klaviyo API error:", error);
    return { total: 0, timeseries: [] };
  }
}
