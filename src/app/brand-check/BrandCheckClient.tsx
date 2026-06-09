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

export default function BrandCheckClient() {
  const [input, setInput] = useState("");
  const [niceClasses, setNiceClasses] = useState("3,5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BrandCheckResult[] | null>(null);

  async function run() {
    const names = input
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) {
      setError("Skriv minst ett namn (ett per rad).");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/brand-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, niceClasses }),
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

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Brand Check</h1>
      <p className="mt-1 text-sm text-gray-500">
        Knockout-koll av varumärke (TMview: EU + PRV + nationellt) och .com-domän. En första
        gallring - ersätter inte juridisk förväxlingsbedömning (Petra).
      </p>

      <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700">Namn (ett per rad)</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          placeholder={"Inner Fuel\nLiving Again\nNo Jante"}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-indigo-500"
        />
        <div className="mt-3 flex items-center gap-4">
          <label className="text-sm text-gray-600">
            Nice-klasser{" "}
            <input
              value={niceClasses}
              onChange={(e) => setNiceClasses(e.target.value)}
              className="ml-1 w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Kontrollerar..." : "Kontrollera"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {results && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Namn</th>
                <th className="px-4 py-2 font-medium">Varumärke (kl {niceClasses})</th>
                <th className="px-4 py-2 font-medium">.com</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((r) => (
                <tr key={r.name} className="align-top">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TM_STYLE[r.trademark.status]}`}
                    >
                      <TmIcon s={r.trademark.status} />
                      {TM_LABEL[r.trademark.status]}
                    </span>
                    {r.trademark.status === "error" && (
                      <p className="mt-1 text-xs text-gray-400">{r.trademark.error}</p>
                    )}
                    {r.trademark.exact.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
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
                  </td>
                  <td className="px-4 py-3">
                    {r.dotcom.available === true && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        ledig
                      </span>
                    )}
                    {r.dotcom.available === false && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        tagen
                      </span>
                    )}
                    {r.dotcom.available === null && (
                      <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                        okänd
                      </span>
                    )}
                    <p className="mt-1 text-xs text-gray-400">{r.dotcom.domain}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
