"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  HelpCircle,
  ExternalLink,
  Star,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  Settings2,
  Globe,
  Scale,
  Search,
} from "lucide-react";

type Overall = "free" | "caution" | "taken" | "unknown";
type TmStatus = "clear" | "similar" | "caution" | "conflict" | "error";
interface TmHit {
  name: string;
  office: string;
  status: string;
  niceClasses: (string | number)[];
  type: string;
  owner: string;
}
interface DomainResult {
  domain: string;
  available: boolean | null;
}
interface WebResult {
  title: string;
  url: string;
}
interface BrandCheckResult {
  name: string;
  overall: Overall;
  reasons: string[];
  trademark: { status: TmStatus; total: number; exact: TmHit[]; wordMatch: TmHit[]; similar: TmHit[]; error?: string };
  domains: DomainResult[];
  web: WebResult[];
}
interface ShortlistItem {
  name: string;
  note: string;
  overall: Overall | null;
  created_at: string;
}
type Cell = { status: "loading" | "done" | "error"; result?: BrandCheckResult };

const OVERALL: Record<Overall, { label: string; cls: string; icon: React.ReactNode }> = {
  free: { label: "Ser ledigt ut", cls: "bg-green-100 text-green-800 ring-green-200", icon: <ShieldCheck className="h-4 w-4" /> },
  caution: { label: "Tveksam", cls: "bg-amber-100 text-amber-800 ring-amber-200", icon: <ShieldAlert className="h-4 w-4" /> },
  taken: { label: "Upptaget / risk", cls: "bg-red-100 text-red-800 ring-red-200", icon: <ShieldX className="h-4 w-4" /> },
  unknown: { label: "Okänt", cls: "bg-gray-200 text-gray-600 ring-gray-300", icon: <HelpCircle className="h-4 w-4" /> },
};

const OFFICE_GROUPS: { key: string; label: string; codes: string[]; def: boolean }[] = [
  { key: "eu", label: "EU", codes: ["EM"], def: true },
  { key: "nordic", label: "Norden", codes: ["SE", "DK", "NO", "FI"], def: true },
  { key: "us", label: "USA", codes: ["US"], def: false },
  { key: "wipo", label: "WIPO", codes: ["WO"], def: false },
  { key: "uk", label: "UK", codes: ["GB"], def: false },
];
const DEFAULT_OFFICE_STATE: Record<string, boolean> = Object.fromEntries(OFFICE_GROUPS.map((g) => [g.key, g.def]));

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      title="Kopiera"
      className="text-gray-400 hover:text-gray-600"
    >
      {done ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function HitList({ label, color, hits }: { label: string; color: string; hits: TmHit[] }) {
  if (hits.length === 0) return null;
  return (
    <div className="mt-2">
      <p className={`text-xs font-medium ${color}`}>{label}</p>
      <ul className="mt-0.5 space-y-0.5 text-xs text-gray-600">
        {hits.slice(0, 6).map((h, i) => (
          <li key={i}>
            <span className="font-medium text-gray-700">{h.name}</span> [{h.office}] {h.status} · kl{" "}
            {h.niceClasses.join(",")} · {h.owner}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BrandCheckClient({
  endpoint = "/api/brand-check",
  shortlistEndpoint = "/api/brand-shortlist",
  token,
}: {
  endpoint?: string;
  shortlistEndpoint?: string;
  token?: string;
}) {
  const [input, setInput] = useState("");
  const [niceClasses, setNiceClasses] = useState("3,5");
  const [offices, setOffices] = useState<Record<string, boolean>>(DEFAULT_OFFICE_STATE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<"search" | "saved">("search");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);

  const slUrl = useCallback(
    () => (token ? `${shortlistEndpoint}?token=${encodeURIComponent(token)}` : shortlistEndpoint),
    [shortlistEndpoint, token]
  );

  const loadShortlist = useCallback(async () => {
    try {
      const res = await fetch(slUrl());
      if (!res.ok) return;
      const data = await res.json();
      setShortlist((data.items ?? []) as ShortlistItem[]);
    } catch {
      /* ignore */
    }
  }, [slUrl]);

  useEffect(() => {
    loadShortlist();
  }, [loadShortlist]);

  const savedSet = new Set(shortlist.map((s) => s.name.toLowerCase()));

  async function run() {
    const names = Array.from(
      new Set(input.split("\n").map((s) => s.trim()).filter(Boolean))
    ).slice(0, 40);
    if (names.length === 0) {
      setError("Skriv minst ett namn (ett per rad).");
      return;
    }
    const officeCodes = OFFICE_GROUPS.filter((g) => offices[g.key]).flatMap((g) => g.codes);
    if (officeCodes.length === 0) {
      setError("Välj minst ett register under Inställningar.");
      return;
    }
    setError(null);
    setRunning(true);
    setTab("search");
    setOrder(names);
    setCells(Object.fromEntries(names.map((n) => [n, { status: "loading" } as Cell])));

    for (const name of names) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [name], niceClasses, offices: officeCodes.join(","), ...(token ? { token } : {}) }),
        });
        const data = await res.json();
        const r = data.results?.[0] as BrandCheckResult | undefined;
        setCells((prev) => ({ ...prev, [name]: r ? { status: "done", result: r } : { status: "error" } }));
      } catch {
        setCells((prev) => ({ ...prev, [name]: { status: "error" } }));
      }
    }
    setRunning(false);
  }

  async function toggleSave(r: BrandCheckResult) {
    const isSaved = savedSet.has(r.name.toLowerCase());
    try {
      await fetch(slUrl(), {
        method: isSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSaved ? { name: r.name } : { name: r.name, overall: r.overall }),
      });
      loadShortlist();
    } catch {
      /* ignore */
    }
  }

  async function removeSaved(name: string) {
    try {
      await fetch(slUrl(), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      loadShortlist();
    } catch {
      /* ignore */
    }
  }

  async function saveNote(name: string, note: string) {
    try {
      await fetch(slUrl(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, note }),
      });
    } catch {
      /* ignore */
    }
  }

  const done = order.map((n) => cells[n]).filter((c) => c?.status === "done") as Cell[];
  const summary = {
    free: done.filter((c) => c.result?.overall === "free").length,
    caution: done.filter((c) => c.result?.overall === "caution").length,
    taken: done.filter((c) => c.result?.overall === "taken").length,
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Brand Check</h1>
      <p className="mt-1 text-sm text-gray-500">
        Kolla varumärke, .com-domän och webben för ett namn - och få en tydlig helhetsdom. Första
        gallring; ersätter inte juridisk bedömning.
      </p>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
        <button
          onClick={() => setTab("search")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === "search" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          Sök
        </button>
        <button
          onClick={() => setTab("saved")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === "saved" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          Sparade ({shortlist.length})
        </button>
      </div>

      {tab === "search" && (
        <>
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              placeholder={"Inner Fuel\nLiving Again\nNo Jante"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base font-mono focus:border-indigo-500 focus:ring-indigo-500"
            />

            {/* Inställningar (hopfällbar) */}
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              <Settings2 className="h-3.5 w-3.5" /> Inställningar
              <ChevronDown className={`h-3.5 w-3.5 transition ${settingsOpen ? "rotate-180" : ""}`} />
            </button>
            {settingsOpen && (
              <div className="mt-2 space-y-2 rounded-md bg-gray-50 p-3 text-sm text-gray-600">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-gray-500">Register:</span>
                  {OFFICE_GROUPS.map((g) => (
                    <label key={g.key} className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={offices[g.key]}
                        onChange={(e) => setOffices((o) => ({ ...o, [g.key]: e.target.checked }))}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {g.label}
                    </label>
                  ))}
                </div>
                <label className="block">
                  Nice-klasser
                  <input
                    value={niceClasses}
                    onChange={(e) => setNiceClasses(e.target.value)}
                    className="ml-2 w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={run}
                disabled={running}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
              >
                {running && <Loader2 className="h-4 w-4 animate-spin" />}
                {running ? "Kontrollerar..." : "Kontrollera"}
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </div>

          {/* Summering */}
          {order.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500">
                {done.length}/{order.length} klara
              </span>
              {summary.free > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">{summary.free} ledig</span>}
              {summary.caution > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{summary.caution} tveksam</span>}
              {summary.taken > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">{summary.taken} upptaget</span>}
            </div>
          )}

          {/* Resultatkort */}
          <div className="mt-3 space-y-3">
            {order.map((name) => {
              const c = cells[name];
              if (!c) return null;
              if (c.status === "loading")
                return (
                  <div key={name} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> {name}…
                  </div>
                );
              if (c.status === "error" || !c.result)
                return (
                  <div key={name} className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
                    <span className="font-semibold text-gray-900">{name}</span>{" "}
                    <span className="text-gray-400">- kunde inte kollas, försök igen</span>
                  </div>
                );
              return <ResultCard key={name} r={c.result} saved={savedSet.has(name.toLowerCase())} onToggleSave={toggleSave} />;
            })}
          </div>
        </>
      )}

      {tab === "saved" && (
        <div className="mt-4 space-y-2">
          {shortlist.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
              Inga sparade namn än. Stjärnmärk ett namn i sökresultaten så hamnar det här.
            </p>
          )}
          {shortlist.map((s) => (
            <div key={s.name} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-2">
                {s.overall && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${OVERALL[s.overall].cls}`}>
                    {OVERALL[s.overall].icon}
                  </span>
                )}
                <span className="font-semibold text-gray-900">{s.name}</span>
                <CopyBtn text={s.name} />
                <button onClick={() => removeSaved(s.name)} title="Ta bort" className="ml-auto text-gray-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input
                defaultValue={s.note}
                onBlur={(e) => saveNote(s.name, e.target.value)}
                placeholder="Anteckning…"
                className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <details className="mt-6 text-xs text-gray-500">
        <summary className="cursor-pointer font-medium">Vad betyder färgerna?</summary>
        <div className="mt-2 space-y-1">
          <p>🟢 <b>Ser ledigt ut</b> - inga varumärkesträffar och .com ledig.</p>
          <p>🟡 <b>Tveksam</b> - ditt ord finns i ett annat märke, .com tagen, eller liknande märken finns.</p>
          <p>🔴 <b>Upptaget / risk</b> - exakt varumärke, aktiv sajt på ditt .com, eller ditt ord i ett märke + .com tagen.</p>
          <p className="pt-1 text-gray-400">Knockout-koll, inte juridisk förväxlingsbedömning. Döda märken exkluderas. Mellanslags-okänsligt (Inner Fuel = innerfuel).</p>
        </div>
      </details>
    </div>
  );
}

function ResultCard({
  r,
  saved,
  onToggleSave,
}: {
  r: BrandCheckResult;
  saved: boolean;
  onToggleSave: (r: BrandCheckResult) => void;
}) {
  const v = OVERALL[r.overall];
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-gray-900">{r.name}</span>
        <CopyBtn text={r.name} />
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${v.cls}`}>
          {v.icon}
          {v.label}
        </span>
        <button
          onClick={() => onToggleSave(r)}
          title={saved ? "Ta bort från sparade" : "Spara"}
          className={`ml-auto ${saved ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}`}
        >
          <Star className="h-5 w-5" fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Skäl */}
      {r.reasons.length > 0 && <p className="mt-1 text-xs text-gray-500">{r.reasons.join(" · ")}</p>}

      {/* Varumärke */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <Scale className="h-3.5 w-3.5" /> Varumärke
        </p>
        {r.trademark.status === "error" ? (
          <p className="mt-1 text-xs text-gray-400">Kunde inte kollas - {r.trademark.error}</p>
        ) : r.trademark.exact.length + r.trademark.wordMatch.length + r.trademark.similar.length === 0 ? (
          <p className="mt-1 text-xs text-green-700">Inga träffar</p>
        ) : (
          <>
            <HitList label="Exakta träffar" color="text-red-700" hits={r.trademark.exact} />
            <HitList label="Ditt ord i annat märke (hög risk)" color="text-orange-700" hits={r.trademark.wordMatch} />
            <HitList label="Liknande" color="text-amber-700" hits={r.trademark.similar} />
          </>
        )}
      </div>

      {/* Domäner */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <Globe className="h-3.5 w-3.5" /> .com-domäner
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {r.domains.map((d) =>
            d.available === false ? (
              <a
                key={d.domain}
                href={`https://${d.domain}`}
                target="_blank"
                rel="noreferrer"
                title="tagen - öppna sajten"
                className="rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-800 underline decoration-red-300 hover:decoration-red-600"
              >
                {d.domain}
              </a>
            ) : (
              <span
                key={d.domain}
                className={`rounded-md px-2 py-0.5 text-xs ${d.available === true ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}
              >
                {d.domain}
              </span>
            )
          )}
        </div>
      </div>

      {/* Webben */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <Search className="h-3.5 w-3.5" /> Webben ({r.name} supplement)
        </p>
        {r.web.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs">
            {r.web.map((w, i) => (
              <li key={i} className="truncate">
                <a href={w.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                  {w.title}
                </a>{" "}
                <span className="text-gray-400">{hostnameOf(w.url)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-gray-400">Inga tydliga webbträffar</p>
        )}
      </div>

      {/* Länkar */}
      <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs">
        <a href="https://www.tmdn.org/tmview/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
          TMview <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(r.name)}+collagen`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
        >
          Google collagen <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(r.name)}+supplement`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
        >
          Google supplement <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
