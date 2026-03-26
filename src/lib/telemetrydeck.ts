// src/lib/telemetrydeck.ts
// TelemetryDeck Query API client

const TD_API_BASE = "https://api.telemetrydeck.com/api/v3";
const POLL_INTERVAL_MS = 500;
const MAX_POLL_MS = 30_000;

// Module-level token cache
let _cachedToken: string | null = null;
let _tokenExpiresAt: Date | null = null;

async function getToken(): Promise<string> {
  // Return cached token if still valid (with 5min buffer)
  if (_cachedToken && _tokenExpiresAt) {
    const bufferMs = 5 * 60 * 1000;
    if (new Date().getTime() + bufferMs < _tokenExpiresAt.getTime()) {
      return _cachedToken;
    }
  }

  const email = process.env.TELEMETRYDECK_EMAIL;
  const password = process.env.TELEMETRYDECK_PASSWORD;
  if (!email || !password) {
    throw new Error("TELEMETRYDECK_EMAIL and TELEMETRYDECK_PASSWORD env vars required");
  }

  const basic = Buffer.from(`${email}:${password}`).toString("base64");
  const res = await fetch(`${TD_API_BASE}/users/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Length": "0",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TelemetryDeck auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  _cachedToken = data.value;
  _tokenExpiresAt = new Date(data.expiresAt);
  return _cachedToken!;
}

// --- Query execution (async flow) ---

interface TqlQuery {
  queryType: string;
  granularity: string;
  dataSource?: string;
  aggregations?: unknown[];
  dimensions?: unknown[];
  filter?: unknown;
  relativeIntervals?: unknown[];
  metric?: unknown;
  dimension?: unknown;
  threshold?: number;
  steps?: unknown[];
  [key: string]: unknown;
}

interface TaskStatusResponse {
  status: "running" | "successful" | "failed";
  error?: string;
}

export async function runQuery<T = unknown>(query: TqlQuery): Promise<T> {
  const token = await getToken();

  // Default dataSource
  if (!query.dataSource) {
    query.dataSource = "telemetry-signals";
  }

  // Submit query
  const submitRes = await fetch(`${TD_API_BASE}/query/calculate-async/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(query),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`TelemetryDeck query submit failed (${submitRes.status}): ${text}`);
  }

  const { queryTaskID } = await submitRes.json();

  // Poll for completion
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${TD_API_BASE}/task/${queryTaskID}/status/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status: TaskStatusResponse = await statusRes.json();

    if (status.status === "successful") {
      const valueRes = await fetch(`${TD_API_BASE}/task/${queryTaskID}/value/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!valueRes.ok) {
        throw new Error(`TelemetryDeck result fetch failed (${valueRes.status})`);
      }
      const data = await valueRes.json();
      return data as T;
    }

    if (status.status === "failed") {
      throw new Error(`TelemetryDeck query failed: ${status.error || "unknown"}`);
    }
  }

  throw new Error("TelemetryDeck query timed out after 30s");
}

// --- Query builders ---

function baseFilter(appId: string): unknown {
  return {
    type: "and",
    fields: [
      { type: "selector", dimension: "appID", value: appId },
      { type: "selector", dimension: "isTestMode", value: "false" },
    ],
  };
}

function eventFilter(appId: string, eventType: string): unknown {
  return {
    type: "and",
    fields: [
      { type: "selector", dimension: "appID", value: appId },
      { type: "selector", dimension: "isTestMode", value: "false" },
      { type: "selector", dimension: "type", value: eventType },
    ],
  };
}

function relativeInterval(daysBack: number): unknown[] {
  return [
    {
      beginningDate: { component: "day", offset: -daysBack, position: "beginning" },
      endDate: { component: "day", offset: 0, position: "end" },
    },
  ];
}

// Unique user count aggregation
const userCountAgg = { type: "thetaSketch", name: "users", fieldName: "clientUser" };
const eventCountAgg = { type: "count", name: "count" };

// --- High-level query helpers ---

export interface TimeseriesRow {
  result: Record<string, number>;
  timestamp: string;
}

export interface GroupByRow {
  event: Record<string, string | number>;
  timestamp: string;
}

interface TdResult<T> {
  calculationDuration: number;
  result: { rows: T[]; type: string };
}

/** Total unique users (all time or within period) */
export async function queryUniqueUsers(appId: string, daysBack?: number) {
  const query: TqlQuery = {
    queryType: "timeseries",
    granularity: "all",
    aggregations: [userCountAgg],
    filter: baseFilter(appId),
  };
  if (daysBack) query.relativeIntervals = relativeInterval(daysBack);
  const res = await runQuery<TdResult<TimeseriesRow>>(query);
  return res.result.rows[0]?.result?.users ?? 0;
}

/** Daily active users timeseries */
export async function queryDailyUsers(appId: string, daysBack: number) {
  const res = await runQuery<TdResult<TimeseriesRow>>({
    queryType: "timeseries",
    granularity: "day",
    aggregations: [userCountAgg, eventCountAgg],
    filter: baseFilter(appId),
    relativeIntervals: relativeInterval(daysBack),
  });
  return res.result.rows.map((r) => ({
    date: r.timestamp.slice(0, 10),
    users: r.result.users ?? 0,
    events: r.result.count ?? 0,
  }));
}

/** Count events of a specific type */
export async function queryEventCount(appId: string, eventType: string, daysBack?: number) {
  const query: TqlQuery = {
    queryType: "timeseries",
    granularity: "all",
    aggregations: [eventCountAgg, userCountAgg],
    filter: eventFilter(appId, eventType),
  };
  if (daysBack) query.relativeIntervals = relativeInterval(daysBack);
  const res = await runQuery<TdResult<TimeseriesRow>>(query);
  const row = res.result.rows[0]?.result;
  return { count: row?.count ?? 0, users: row?.users ?? 0 };
}

/** Event timeseries (daily) */
export async function queryEventTimeseries(appId: string, eventType: string, daysBack: number) {
  const res = await runQuery<TdResult<TimeseriesRow>>({
    queryType: "timeseries",
    granularity: "day",
    aggregations: [eventCountAgg, userCountAgg],
    filter: eventFilter(appId, eventType),
    relativeIntervals: relativeInterval(daysBack),
  });
  return res.result.rows.map((r) => ({
    date: r.timestamp.slice(0, 10),
    count: r.result.count ?? 0,
    users: r.result.users ?? 0,
  }));
}

/** Group by a dimension for a specific event type */
export async function queryGroupBy(
  appId: string,
  eventType: string,
  dimensionName: string,
  daysBack?: number,
) {
  const query: TqlQuery = {
    queryType: "groupBy",
    granularity: "all",
    dimensions: [{ type: "default", dimension: dimensionName, outputName: dimensionName }],
    aggregations: [eventCountAgg, userCountAgg],
    filter: eventFilter(appId, eventType),
  };
  if (daysBack) query.relativeIntervals = relativeInterval(daysBack);
  const res = await runQuery<TdResult<GroupByRow>>(query);
  return res.result.rows.map((r) => ({
    value: String(r.event[dimensionName] ?? ""),
    count: Number(r.event.count ?? 0),
    users: Number(r.event.users ?? 0),
  }));
}

/** All event types breakdown */
export async function queryEventBreakdown(appId: string, daysBack?: number) {
  const query: TqlQuery = {
    queryType: "groupBy",
    granularity: "all",
    dimensions: [{ type: "default", dimension: "type", outputName: "eventType" }],
    aggregations: [eventCountAgg, userCountAgg],
    filter: baseFilter(appId),
  };
  if (daysBack) query.relativeIntervals = relativeInterval(daysBack);
  const res = await runQuery<TdResult<GroupByRow>>(query);
  return res.result.rows.map((r) => ({
    eventType: String(r.event.eventType ?? ""),
    count: Number(r.event.count ?? 0),
    users: Number(r.event.users ?? 0),
  }));
}
