"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, HelpCircle } from "lucide-react";

type TmStatus = "clear" | "similar" | "conflict" | "error";
interface TmHit {
  name: string;
  office: string;
  status: string;
  niceClasses: string[];
  type: string;
  owner: string;
}
interface BrandCheckResult {
  name: string;
  trademark: { status: TmStatus; total: number; exact: TmHit[]; similar: TmHit[]; error?: string };
  dotcom: { domain: string; available: boolean | null; error?: string };
}

const TM_LABEL: Record<TmStatus, string> = {
  clear: "Inga träffar",
  similar: "Liknande finns",
  conflict: "Exakt träff",
  error: "Fel - ej kollat",
};
const TM_STYLE: Record<TmStatus, string> = {
  clear: "bg-green-100 text-green-800",
  similar: "bg-amber-100 text-amber-800",
  conflict: "bg-red-100 text-red-800",
  error: "bg-gray-200 text-gray-600",
};
function TmIcon({ s }: { s: TmStatus }) {
  if (s === "clear") return <ShieldCheck className="w-4 h-4" />;
  if (s === "similar") return <ShieldAlert className="w-4 h-4" />;
  if (s === "conflict") return <ShieldX className="w-4 h-4" />;
  return <HelpCircle className="w-4 h-4" />;
}

export default function BrandCheckClient({
  endpoint = "/api/brand-check",
  token,
}: {
  endpoint?: string;
  token?: string;
}) {
  const [input, setInput] = useState("");
  const [niceClasses, setNiceClasses] = useState("3,5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BrandCheckResult[] | null>(null);

  async function run() {
    const names = input.split("\n").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
      setError("Skriv minst ett namn (ett per rad).");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, niceClasses, ...(token ? { token } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResults(data.results as BrandCheckResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  function Chip({ children, className }: { children: React.ReactNode; className: string }) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
        {children}
      </span>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Brand Check</h1>
      <p className="mt-1 text-sm text-gray-500">
        Knockout-koll: varumärke (TMview EU+PRV+nationellt, kl {niceClasses}) + .com. Första
        gallring - ersätter inte juridisk bedömning.
      </p>

      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          inputMode="text"
          placeholder={"Inner Fuel\nLiving Again\nNo Jante"}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base font-mono focus:border-indigo-500 focus:ring-indigo-500"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="text-sm text-gray-600">
            Nice-klasser
            <input
              value={niceClasses}
              onChange={(e) => setNiceClasses(e.target.value)}
              className="ml-2 w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:ml-auto sm:w-auto"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Kontrollerar..." : "Kontrollera"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {results && (
        <div className="mt-5 space-y-3">
          {results.map((r) => (
            <div key={r.name} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="font-semibold text-gray-900">{r.name}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip className={TM_STYLE[r.trademark.status]}>
                  <TmIcon s={r.trademark.status} />
                  {TM_LABEL[r.trademark.status]}
                </Chip>
                {r.dotcom.available === true && <Chip className="bg-green-100 text-green-800">.com ledig</Chip>}
                {r.dotcom.available === false && <Chip className="bg-red-100 text-red-800">.com tagen</Chip>}
                {r.dotcom.available === null && <Chip className="bg-gray-200 text-gray-600">.com okänd</Chip>}
              </div>
              {r.trademark.exact.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
                  {r.trademark.exact.slice(0, 4).map((h, i) => (
                    <li key={i}>
                      {h.name} [{h.office}] {h.status} · kl {h.niceClasses.join(",")} · {h.owner}
                    </li>
                  ))}
                </ul>
              )}
              {r.trademark.status === "similar" && (
                <p className="mt-1 text-xs text-gray-400">{r.trademark.total} liknande träffar</p>
              )}
              {r.trademark.status === "error" && (
                <p className="mt-1 text-xs text-gray-400">{r.trademark.error}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">{r.dotcom.domain}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
