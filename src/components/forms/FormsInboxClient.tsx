"use client";

// Inbox for self-hosted form submissions: the visible queue of everything
// customers have sent, incl. failed helpdesk deliveries (with retry).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Inbox,
  RefreshCw,
  SkipForward,
} from "lucide-react";
import type { SubmissionAnswer, SubmissionFile } from "@/types/forms";

interface SubmissionListItem {
  id: string;
  form_id: string;
  market: string | null;
  client_submission_id: string;
  email: string | null;
  name: string | null;
  order_number: string | null;
  gate_status: string | null;
  delivery_status: "pending" | "delivered" | "failed" | "skipped";
  delivery_attempts: number;
  next_retry_at: string | null;
  delivered_at: string | null;
  ticket_id: string | null;
  last_error: string | null;
  is_test: boolean;
  created_at: string;
  payload: SubmissionAnswer[];
  files: SubmissionFile[];
}

interface FormListItem {
  id: string;
  slug: string;
  name: string;
  market: string;
  status: string;
}

interface TicketInfo {
  loading: boolean;
  url?: string;
  statusLabel?: string;
  updatedAt?: string | null;
  deleted?: boolean;
}

const STATUS_FILTERS = [
  { value: "", label: "Alla" },
  { value: "pending", label: "Väntar" },
  { value: "delivered", label: "Levererade" },
  { value: "failed", label: "Misslyckade" },
  { value: "skipped", label: "Utanför fönster" },
] as const;

function StatusBadge({ s }: { s: SubmissionListItem }) {
  if (s.delivery_status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
        <CheckCircle2 className="h-3 w-3" /> Levererad{s.ticket_id ? ` #${s.ticket_id}` : ""}
      </span>
    );
  }
  if (s.delivery_status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 border border-red-200">
        <AlertTriangle className="h-3 w-3" /> Misslyckad ({s.delivery_attempts} försök)
      </span>
    );
  }
  if (s.delivery_status === "skipped") {
    const label = s.gate_status === "too_late" ? "För sent" : s.gate_status === "too_early" ? "För tidigt" : "Skippad";
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 border border-gray-200">
        <SkipForward className="h-3 w-3" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
      <Clock className="h-3 w-3" /> Väntar{s.delivery_attempts > 0 ? ` (försök ${s.delivery_attempts})` : ""}
    </span>
  );
}

export default function FormsInboxClient() {
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [formFilter, setFormFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [tickets, setTickets] = useState<Record<string, TicketInfo>>({});
  const [copiedForm, setCopiedForm] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(true);

  const load = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/forms/submissions${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as { submissions: SubmissionListItem[]; forms: FormListItem[] };
      setSubmissions(data.submissions);
      setForms(data.forms);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const formById = useMemo(() => {
    const m = new Map<string, FormListItem>();
    forms.forEach((f) => m.set(f.id, f));
    return m;
  }, [forms]);

  const toggleExpanded = (id: string) => {
    const willOpen = !expanded.has(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Live Freshdesk-status vid expandering (en gång per rad)
    if (willOpen && !tickets[id]) {
      const sub = submissions.find((s) => s.id === id);
      if (sub?.ticket_id) {
        setTickets((prev) => ({ ...prev, [id]: { loading: true } }));
        fetch(`/api/forms/submissions/${id}/ticket`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const t = data?.ticket ?? null;
            setTickets((prev) => ({
              ...prev,
              [id]: t
                ? { loading: false, url: t.url, statusLabel: t.statusLabel, updatedAt: t.updatedAt, deleted: t.deleted }
                : { loading: false },
            }));
          })
          .catch(() => setTickets((prev) => ({ ...prev, [id]: { loading: false } })));
      }
    }
  };

  const retry = async (id: string) => {
    setRetrying((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/forms/submissions/${id}/retry`, { method: "POST" });
      await load();
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const problemCount = submissions.filter((s) => s.delivery_status === "failed").length;

  // Hub-origin för embed-koder/länkar (samma origin som sidan körs på)
  const hubOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const workspaceSlug = "hydro13"; // TODO: exponera aktiv workspace-slug via API när fler workspaces får formulär

  const embedCode = (formSlug: string, market: string) =>
    `<div id="ch-form-${formSlug}"></div>\n<script src="${hubOrigin}/forms-embed/v1.js" data-workspace="${workspaceSlug}" data-form="${formSlug}" data-market="${market}" data-target="#ch-form-${formSlug}" defer></script>`;

  const copyEmbed = async (form: FormListItem) => {
    try {
      await navigator.clipboard.writeText(embedCode(form.slug, form.market));
      setCopiedForm(form.id);
      setTimeout(() => setCopiedForm(null), 2000);
    } catch {
      // Clipboard blockerad - ingen åtgärd, koden syns i rutan
    }
  };

  const submissionCountByForm = useMemo(() => {
    const m = new Map<string, number>();
    submissions.forEach((s) => {
      if (!s.is_test) m.set(s.form_id, (m.get(s.form_id) ?? 0) + 1);
    });
    return m;
  }, [submissions]);

  const visibleSubmissions = useMemo(
    () => (formFilter ? submissions.filter((s) => s.form_id === formFilter) : submissions),
    [submissions, formFilter]
  );

  // Statistik över senaste laddningen (exkl. syntetiska tester)
  const stats = useMemo(() => {
    const real = visibleSubmissions.filter((s) => !s.is_test);
    const now = Date.now();
    const week = real.filter((s) => now - new Date(s.created_at).getTime() < 7 * 24 * 60 * 60 * 1000);
    return {
      week: week.length,
      total: real.length,
      delivered: real.filter((s) => s.delivery_status === "delivered").length,
      pending: real.filter((s) => s.delivery_status === "pending").length,
      failed: real.filter((s) => s.delivery_status === "failed").length,
      gated: real.filter((s) => s.delivery_status === "skipped").length,
    };
  }, [visibleSubmissions]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Inbox className="h-6 w-6" /> Formulär
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Inskickade supportformulär (egna, ersätter Fillout). Allt sparas här först - misslyckade
            helpdesk-leveranser kan köras om.
          </p>
        </div>
        <button
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" /> Uppdatera
        </button>
      </div>

      {problemCount > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {problemCount} submission{problemCount > 1 ? "s" : ""} har misslyckad leverans - inget är
          tappat, men kör om dem nedan.
        </div>
      )}

      <div className="mb-4 rounded-xl border border-gray-200 bg-white">
        <button
          onClick={() => setShowLibrary((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left"
        >
          {showLibrary ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <FileText className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-gray-900">Våra formulär ({forms.length})</span>
          <span className="text-xs text-gray-400 ml-2">visa, testa och kopiera embed-kod till Shopify</span>
        </button>
        {showLibrary && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {forms.map((f) => (
              <div key={f.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{f.name}</span>
                  <span className="rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
                    {f.slug} · {f.market.toUpperCase()}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs border ${
                      f.status === "published"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}
                  >
                    {f.status === "published" ? "Publicerat" : f.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {submissionCountByForm.get(f.id) ?? 0} inskickade
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-xs">
                    <a
                      href={`${hubOrigin}/f/${workspaceSlug}/${f.slug}?market=${f.market}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Öppna
                    </a>
                    <a
                      href={`${hubOrigin}/f/${workspaceSlug}/${f.slug}?market=${f.market}&test=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-gray-500 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Testläge
                    </a>
                  </span>
                </div>
                <div className="mt-2 flex items-start gap-2">
                  <pre className="flex-1 overflow-x-auto rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700 whitespace-pre-wrap break-all">
                    {embedCode(f.slug, f.market)}
                  </pre>
                  <button
                    onClick={() => copyEmbed(f)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border ${
                      copiedForm === f.id
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {copiedForm === f.id ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Kopierad!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Kopiera
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Senaste 7 dagarna", value: stats.week },
          { label: "Levererade", value: stats.delivered },
          { label: "Väntar", value: stats.pending },
          { label: "Misslyckade", value: stats.failed, alert: stats.failed > 0 },
          { label: "Utanför fönster", value: stats.gated },
        ].map((t) => (
          <div
            key={t.label}
            className={`rounded-xl border px-3 py-2 ${
              t.alert ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"
            }`}
          >
            <div className={`text-lg font-bold ${t.alert ? "text-red-700" : "text-gray-900"}`}>{t.value}</div>
            <div className="text-xs text-gray-500">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1 text-sm border ${
              statusFilter === f.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
        <select
          value={formFilter}
          onChange={(e) => setFormFilter(e.target.value)}
          className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          <option value="">Alla formulär</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.market.toUpperCase()})
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm py-12 text-center">Laddar...</div>
      ) : visibleSubmissions.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500">
          <Inbox className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          Inga submissions ännu{statusFilter || formFilter ? " med det filtret" : ""}.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleSubmissions.map((s) => {
            const form = formById.get(s.form_id);
            const isOpen = expanded.has(s.id);
            return (
              <div key={s.id} className="rounded-xl border border-gray-200 bg-white">
                <button
                  onClick={() => toggleExpanded(s.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">
                        {form?.name ?? "Okänt formulär"}
                      </span>
                      {s.is_test && (
                        <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700">
                          test
                        </span>
                      )}
                      <StatusBadge s={s} />
                    </div>
                    <div className="text-sm text-gray-500 truncate">
                      {s.name ?? "-"} · {s.email ?? "-"}
                      {s.order_number ? ` · #${s.order_number}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0">
                    {new Date(s.created_at).toLocaleString("sv-SE", {
                      timeZone: "Europe/Stockholm",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    {s.ticket_id && (
                      <div className="mb-3 flex items-center gap-2 text-sm">
                        {tickets[s.id]?.loading ? (
                          <span className="text-gray-400">Hämtar ticketstatus...</span>
                        ) : tickets[s.id]?.deleted ? (
                          <span className="rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                            Ticket #{s.ticket_id} raderad i Freshdesk
                          </span>
                        ) : (
                          <>
                            {tickets[s.id]?.statusLabel && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium border ${
                                  tickets[s.id].statusLabel === "Löst" || tickets[s.id].statusLabel === "Stängd"
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}
                              >
                                Freshdesk: {tickets[s.id].statusLabel}
                              </span>
                            )}
                            {tickets[s.id]?.url && (
                              <a
                                href={tickets[s.id].url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs"
                              >
                                <ExternalLink className="h-3 w-3" /> Öppna ticket #{s.ticket_id} i Freshdesk
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {s.last_error && (
                      <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 font-mono break-all">
                        {s.last_error}
                      </div>
                    )}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      {(s.payload ?? []).map((a) => (
                        <div key={a.key}>
                          <dt className="font-medium text-gray-700">{a.label}</dt>
                          <dd className="text-gray-600 whitespace-pre-wrap break-words">
                            {a.value === true ? "Ja" : a.value === false ? "Nej" : String(a.value ?? "-") || "-"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {(s.files ?? []).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.files.map((f, i) => (
                          <a
                            key={i}
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                          >
                            <ExternalLink className="h-3 w-3" /> {f.filename ?? "Fil"}
                          </a>
                        ))}
                      </div>
                    )}
                    {s.delivery_status !== "delivered" && !s.is_test && (
                      <div className="mt-3">
                        <button
                          onClick={() => retry(s.id)}
                          disabled={retrying.has(s.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          <RefreshCw className={`h-4 w-4 ${retrying.has(s.id) ? "animate-spin" : ""}`} />
                          {retrying.has(s.id) ? "Levererar..." : "Skicka till helpdesk nu"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
