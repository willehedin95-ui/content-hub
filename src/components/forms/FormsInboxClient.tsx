"use client";

// Inbox for self-hosted form submissions: the visible queue of everything
// customers have sent, incl. failed helpdesk deliveries (with retry).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
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
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

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
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      <div className="mb-4 flex gap-2">
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
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm py-12 text-center">Laddar...</div>
      ) : submissions.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500">
          <Inbox className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          Inga submissions ännu{statusFilter ? " med det filtret" : ""}.
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map((s) => {
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
