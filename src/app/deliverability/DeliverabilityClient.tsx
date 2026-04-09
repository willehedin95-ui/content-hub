"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Mail,
  Shield,
  Activity,
  Clock,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

const DOMAINS = [
  "get-renew.com",
  "swedishbalance.se",
  "swedishbalance.org",
  "doginwork.com",
];

type Reputation = "HIGH" | "MEDIUM" | "LOW" | "BAD" | "REPUTATION_CATEGORY_UNSPECIFIED" | null;

interface TrafficStat {
  domain: string;
  date: string;
  domain_reputation: Reputation;
  user_reported_spam_ratio: number | null;
  dkim_success_ratio: number | null;
  spf_success_ratio: number | null;
  dmarc_success_ratio: number | null;
  ip_reputations: unknown;
  delivery_errors: unknown;
  spammy_feedback_loops: unknown;
}

interface DmarcReport {
  id: string;
  postmark_report_id: number;
  domain: string;
  organization_name: string;
  date_range_begin: string;
  date_range_end: string;
  total_messages: number;
  dkim_pass: number;
  spf_pass: number;
  dmarc_pass: number;
  dmarc_fail: number;
  unique_source_ips: number;
  records: Array<{
    source_ip: string;
    count: number;
    policy_evaluated: {
      disposition: string;
      dkim: string;
      spf: string;
    };
    identifiers: {
      header_from: string;
    };
    auth_results: {
      dkim?: Array<{ domain: string; result: string; selector?: string }>;
      spf?: Array<{ domain: string; result: string }>;
    };
  }>;
  policy_published: { p?: string; sp?: string; pct?: number } | null;
}

interface SyncLog {
  ran_at: string;
  postmaster_ok: boolean;
  postmaster_domains_synced: number;
  postmaster_days_fetched: number;
  dmarc_ok: boolean;
  dmarc_reports_fetched: number;
  errors: Array<{ source: string; domain?: string; error: string }> | null;
}

interface DashboardData {
  postmaster: Record<string, TrafficStat[]>;
  dmarc: DmarcReport[];
  last_sync: SyncLog | null;
}

function reputationColor(rep: Reputation): string {
  switch (rep) {
    case "HIGH":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "MEDIUM":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "LOW":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "BAD":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-800 text-zinc-500 border-zinc-700";
  }
}

function formatRatio(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "-";
  return `${(v * 100).toFixed(decimals)}%`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Compare two most recent traffic stats and return trend */
function trend(
  recent: number | null | undefined,
  previous: number | null | undefined
): "up" | "down" | "flat" | null {
  if (recent == null || previous == null) return null;
  const diff = recent - previous;
  if (Math.abs(diff) < 0.001) return "flat";
  return diff > 0 ? "up" : "down";
}

export default function DeliverabilityClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/deliverability/data");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/deliverability/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        alert(`Sync failed: ${JSON.stringify(body)}`);
      }
      await load();
    } catch (err) {
      alert(`Sync failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-zinc-400">
        <RefreshCw className="animate-spin inline mr-2" size={16} />
        Loading deliverability data...
      </div>
    );
  }

  const postmaster = data?.postmaster ?? {};
  const dmarcReports = data?.dmarc ?? [];
  const lastSync = data?.last_sync;

  // Aggregate DMARC stats
  const totalDmarcMessages = dmarcReports.reduce(
    (s, r) => s + r.total_messages,
    0
  );
  const totalDmarcPass = dmarcReports.reduce((s, r) => s + r.dmarc_pass, 0);
  const totalDmarcFail = dmarcReports.reduce((s, r) => s + r.dmarc_fail, 0);
  const passRate =
    totalDmarcMessages > 0 ? totalDmarcPass / totalDmarcMessages : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 flex items-center gap-3">
            <Mail className="text-blue-400" size={24} />
            Deliverability
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gmail Postmaster Tools + Postmark DMARC aggregate reports
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <div className="text-xs text-zinc-500 text-right">
              <div>Last sync: {formatRelative(lastSync.ran_at)}</div>
              <div>
                {lastSync.postmaster_domains_synced} domains,{" "}
                {lastSync.dmarc_reports_fetched} reports
              </div>
            </div>
          )}
          <button
            onClick={runSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg flex items-center gap-2"
          >
            <RefreshCw className={syncing ? "animate-spin" : ""} size={14} />
            {syncing ? "Syncing..." : "Sync now"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={<Shield size={18} />}
          label="Domains monitored"
          value={`${Object.values(postmaster).filter((rows) => rows.length > 0).length} / ${DOMAINS.length}`}
          sub="Gmail Postmaster Tools"
        />
        <SummaryCard
          icon={<Activity size={18} />}
          label="DMARC reports (30d)"
          value={String(dmarcReports.length)}
          sub={
            dmarcReports.length === 0
              ? "Waiting for first report..."
              : `${totalDmarcMessages.toLocaleString()} messages`
          }
        />
        <SummaryCard
          icon={
            passRate == null ? (
              <Minus size={18} />
            ) : passRate >= 0.99 ? (
              <CheckCircle2 size={18} className="text-green-400" />
            ) : passRate >= 0.95 ? (
              <AlertTriangle size={18} className="text-amber-400" />
            ) : (
              <XCircle size={18} className="text-red-400" />
            )
          }
          label="DMARC pass rate"
          value={passRate == null ? "-" : formatRatio(passRate, 2)}
          sub={
            totalDmarcFail > 0
              ? `${totalDmarcFail.toLocaleString()} failed`
              : "All aligned"
          }
        />
      </div>

      {/* Per-domain postmaster cards */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Gmail reputation
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {DOMAINS.map((domain) => {
            const rows = postmaster[domain] ?? [];
            return (
              <DomainCard key={domain} domain={domain} rows={rows} />
            );
          })}
        </div>
      </div>

      {/* DMARC reports list */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          DMARC aggregate reports
          <span className="ml-2 text-xs font-normal normal-case text-zinc-600">
            (get-renew.com via Postmark)
          </span>
        </h2>
        {dmarcReports.length === 0 ? (
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-lg text-center text-sm text-zinc-500">
            No DMARC reports yet. Reporters (Gmail, Yahoo, Outlook) send daily
            aggregates - first report typically arrives within 24-72 hours of
            publishing the `rua` record.
          </div>
        ) : (
          <div className="space-y-2">
            {dmarcReports.map((report) => (
              <DmarcReportRow
                key={report.id}
                report={report}
                expanded={expandedReport === report.id}
                onToggle={() =>
                  setExpandedReport(expandedReport === report.id ? null : report.id)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Sync log errors */}
      {lastSync?.errors && lastSync.errors.length > 0 && (
        <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 text-sm font-semibold mb-2">
            <AlertTriangle size={16} />
            Last sync had {lastSync.errors.length} error(s)
          </div>
          <ul className="text-xs text-zinc-400 space-y-1">
            {lastSync.errors.map((err, i) => (
              <li key={i}>
                <span className="text-zinc-500">[{err.source}</span>
                {err.domain && (
                  <span className="text-zinc-500"> {err.domain}</span>
                )}
                <span className="text-zinc-500">]</span> {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wider mb-2">
        <span className="text-zinc-400">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{sub}</div>
    </div>
  );
}

function DomainCard({ domain, rows }: { domain: string; rows: TrafficStat[] }) {
  const latest = rows[0];
  const previous = rows[1];

  if (!latest) {
    return (
      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-sm text-zinc-200">{domain}</div>
          <div className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-500">
            No data
          </div>
        </div>
        <div className="text-xs text-zinc-500">
          Gmail Postmaster Tools needs ~10+ messages/day to Gmail users before
          it reports stats. Once you start sending through this domain, data
          will appear after 2-3 days.
        </div>
      </div>
    );
  }

  const spamTrend = trend(
    latest.user_reported_spam_ratio,
    previous?.user_reported_spam_ratio
  );

  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-sm text-zinc-200">{domain}</div>
        <div
          className={`text-xs px-2 py-0.5 rounded border font-semibold ${reputationColor(latest.domain_reputation)}`}
        >
          {latest.domain_reputation ?? "UNKNOWN"}
        </div>
      </div>

      <div className="text-xs text-zinc-500 mb-3">
        Latest: {formatDate(latest.date)}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric
          label="Spam rate"
          value={formatRatio(latest.user_reported_spam_ratio, 3)}
          trend={spamTrend}
          inverted
          warning={
            latest.user_reported_spam_ratio != null &&
            latest.user_reported_spam_ratio >= 0.003
          }
        />
        <Metric
          label="DMARC pass"
          value={formatRatio(latest.dmarc_success_ratio)}
        />
        <Metric label="DKIM pass" value={formatRatio(latest.dkim_success_ratio)} />
        <Metric label="SPF pass" value={formatRatio(latest.spf_success_ratio)} />
      </div>

      {/* Sparkline-ish history */}
      {rows.length > 1 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
            Last {rows.length} days
          </div>
          <div className="flex items-end gap-0.5 h-8">
            {rows
              .slice()
              .reverse()
              .map((row) => {
                const rep = row.domain_reputation;
                const height =
                  rep === "HIGH"
                    ? "h-full"
                    : rep === "MEDIUM"
                      ? "h-2/3"
                      : rep === "LOW"
                        ? "h-1/3"
                        : rep === "BAD"
                          ? "h-1"
                          : "h-1";
                const color =
                  rep === "HIGH"
                    ? "bg-green-500"
                    : rep === "MEDIUM"
                      ? "bg-amber-500"
                      : rep === "LOW"
                        ? "bg-orange-500"
                        : rep === "BAD"
                          ? "bg-red-500"
                          : "bg-zinc-700";
                return (
                  <div
                    key={row.date}
                    className={`flex-1 ${height} ${color} rounded-sm`}
                    title={`${row.date}: ${rep ?? "unknown"}`}
                  />
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  trend: t,
  inverted,
  warning,
}: {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat" | null;
  inverted?: boolean;
  warning?: boolean;
}) {
  const goodDir = inverted ? "down" : "up";
  const trendColor =
    t == null || t === "flat"
      ? "text-zinc-500"
      : t === goodDir
        ? "text-green-400"
        : "text-red-400";
  const TrendIcon =
    t === "up" ? TrendingUp : t === "down" ? TrendingDown : Minus;

  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-lg font-semibold ${warning ? "text-amber-400" : "text-zinc-100"}`}
        >
          {value}
        </span>
        {t && <TrendIcon size={12} className={trendColor} />}
      </div>
    </div>
  );
}

function DmarcReportRow({
  report,
  expanded,
  onToggle,
}: {
  report: DmarcReport;
  expanded: boolean;
  onToggle: () => void;
}) {
  const passRate =
    report.total_messages > 0 ? report.dmarc_pass / report.total_messages : 0;
  const statusColor =
    passRate >= 0.99
      ? "text-green-400"
      : passRate >= 0.95
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/50"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown size={14} className="text-zinc-500" />
          ) : (
            <ChevronRight size={14} className="text-zinc-500" />
          )}
          <div className="text-left">
            <div className="text-sm text-zinc-200">
              {report.organization_name}
            </div>
            <div className="text-xs text-zinc-500">
              <Clock size={10} className="inline mr-1" />
              {formatDate(report.date_range_begin)} -{" "}
              {formatDate(report.date_range_end)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-zinc-500">Messages: </span>
            <span className="text-zinc-200">
              {report.total_messages.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">IPs: </span>
            <span className="text-zinc-200">{report.unique_source_ips}</span>
          </div>
          <div className={statusColor}>
            {formatRatio(passRate, 1)} pass
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 p-4 bg-zinc-950">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
            Per-source breakdown
          </div>
          <div className="space-y-2">
            {report.records.map((rec, i) => {
              const dkimDomain = rec.auth_results.dkim?.[0]?.domain ?? "-";
              const spfDomain = rec.auth_results.spf?.[0]?.domain ?? "-";
              const passed =
                rec.policy_evaluated.dkim === "pass" ||
                rec.policy_evaluated.spf === "pass";
              return (
                <div
                  key={i}
                  className={`p-2 rounded text-xs border ${
                    passed
                      ? "bg-green-500/5 border-green-500/10"
                      : "bg-red-500/5 border-red-500/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-mono text-zinc-300">
                      {rec.source_ip}
                    </div>
                    <div className="text-zinc-500">
                      {rec.count} message{rec.count !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
                    <div>
                      From: <span className="text-zinc-400">{rec.identifiers.header_from}</span>
                    </div>
                    <div>
                      Disposition:{" "}
                      <span className="text-zinc-400">
                        {rec.policy_evaluated.disposition}
                      </span>
                    </div>
                    <div>
                      DKIM:{" "}
                      <span
                        className={
                          rec.policy_evaluated.dkim === "pass"
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {rec.policy_evaluated.dkim}
                      </span>{" "}
                      <span className="text-zinc-600">({dkimDomain})</span>
                    </div>
                    <div>
                      SPF:{" "}
                      <span
                        className={
                          rec.policy_evaluated.spf === "pass"
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {rec.policy_evaluated.spf}
                      </span>{" "}
                      <span className="text-zinc-600">({spfDomain})</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
