"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
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
  Wand2,
} from "lucide-react";

type Overall = "free" | "caution" | "taken" | "unknown";
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
  domains: DomainResult[];
  web: WebResult[];
}
interface ShortlistItem {
  name: string;
  note: string;
  overall: Overall | null;
  snapshot?: { overall?: Overall; domains?: DomainResult[]; reasons?: string[] } | null;
  created_at: string;
}
type Cell = { status: "loading" | "done" | "error"; result?: BrandCheckResult };

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

// Bygg en TMview-länk förfiltrerad på namnet + valda kontor + klasser + bara levande märken.
const clean = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).join(",");
function tmviewUrl(name: string, offices: string, classes: string) {
  const q = new URLSearchParams({
    page: "1",
    pageSize: "30",
    criteria: "C",
    basicSearch: name,
    fNiceClass: clean(classes), // saneras: trailing-komma/tomma klasser ger annars "No rows found"
    fOffices: clean(offices),
    fTMStatus: "Registered,Filed",
  });
  return `https://www.tmdn.org/tmview/#/tmview/results?${q.toString()}`;
}

export default function BrandCheckClient({
  endpoint = "/api/brand-check",
  shortlistEndpoint = "/api/brand-shortlist",
  ideasEndpoint = "/api/brand-ideas",
  token,
}: {
  endpoint?: string;
  shortlistEndpoint?: string;
  ideasEndpoint?: string;
  token?: string;
}) {
  const [input, setInput] = useState("");
  const niceClasses = "3,5,35"; // alltid: kosmetika (3) + kosttillskott (5) + handel/marknadsföring (35)
  const [offices, setOffices] = useState<Record<string, boolean>>(DEFAULT_OFFICE_STATE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<"search" | "saved">("search");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
  const [ideaTheme, setIdeaTheme] = useState("");
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [scope, setScope] = useState("");

  async function generateIdeas() {
    setIdeaLoading(true);
    setError(null);
    try {
      const res = await fetch(ideasEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: ideaTheme, ...(token ? { token } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte generera");
      setIdeas((data.names ?? []) as string[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte generera");
    } finally {
      setIdeaLoading(false);
    }
  }

  // Kom ihåg inställningar mellan besök
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("brandcheck-settings") || "{}");
      if (s.offices) setOffices((o) => ({ ...o, ...s.offices }));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("brandcheck-settings", JSON.stringify({ offices }));
    } catch {
      /* ignore */
    }
  }, [offices]);

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
    return runNames(input.split("\n"));
  }

  async function runNames(raw: string[]) {
    const names = Array.from(new Set(raw.map((s) => s.trim()).filter(Boolean))).slice(0, 40);
    if (names.length === 0) {
      setError("Skriv minst ett namn (ett per rad).");
      return;
    }
    const officeCodes = OFFICE_GROUPS.filter((g) => offices[g.key]).flatMap((g) => g.codes);
    if (officeCodes.length === 0) {
      setError("Välj minst ett register under Inställningar.");
      return;
    }
    setScope(OFFICE_GROUPS.filter((g) => offices[g.key]).map((g) => g.label).join("+") + " · kl " + niceClasses);
    setError(null);
    setRunning(true);
    setTab("search");
    setOrder(names);
    setCells(Object.fromEntries(names.map((n) => [n, { status: "loading" } as Cell])));

    for (const name of names) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 70000); // hänger aldrig kvar
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [name], niceClasses, offices: officeCodes.join(","), ...(token ? { token } : {}) }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        const r = data.results?.[0] as BrandCheckResult | undefined;
        setCells((prev) => ({ ...prev, [name]: r ? { status: "done", result: r } : { status: "error" } }));
      } catch {
        setCells((prev) => ({ ...prev, [name]: { status: "error" } }));
      } finally {
        clearTimeout(to);
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
        body: JSON.stringify(
          isSaved ? { name: r.name } : { name: r.name, overall: r.overall, snapshot: { overall: r.overall, domains: r.domains, reasons: r.reasons } }
        ),
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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Brand Check</h1>
      <p className="mt-1 text-sm text-gray-500">
        Kolla .com-domäner + webben (konkurrenter) för ett namn, och öppna en förfiltrerad
        TMview-sökning för varumärket (klass {niceClasses}, valda register, bara levande märken).
        Första gallring - ersätter inte juridisk bedömning.
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
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
              }}
              placeholder="Skriv ett namn och tryck Enter…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-indigo-500 focus:ring-indigo-500"
            />

            {/* Namn-generator */}
            <div className="mt-3 flex flex-col gap-2 rounded-md bg-indigo-50/60 p-2 sm:flex-row sm:items-center">
              <input
                value={ideaTheme}
                onChange={(e) => setIdeaTheme(e.target.value)}
                placeholder="Tema (valfritt): t.ex. fuel, comeback, lekfullt…"
                className="flex-1 rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <button
                onClick={generateIdeas}
                disabled={ideaLoading}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {ideaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Föreslå namn
              </button>
            </div>
            {ideas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ideas.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setInput(n);
                      runNames([n]);
                    }}
                    title="Klicka för att kolla"
                    className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

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
                <div className="text-xs text-gray-500">
                  <p className="font-medium text-gray-600">Klasser (alltid 3, 5, 35):</p>
                  <ul className="mt-0.5 space-y-0.5">
                    <li><b>3</b> - kosmetika &amp; hudvård</li>
                    <li><b>5</b> - kosttillskott &amp; farmaceutiska</li>
                    <li><b>35</b> - marknadsföring &amp; detaljhandel (e-handel)</li>
                  </ul>
                </div>
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
            <div className="mt-4 text-xs text-gray-500">
              {done.length}/{order.length} klara
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
              return (
                <ResultCard
                  key={name}
                  r={c.result}
                  scope={scope}
                  linkOffices={OFFICE_GROUPS.filter((g) => offices[g.key]).flatMap((g) => g.codes).join(",") || "EM,SE,DK,NO,FI"}
                  linkClasses={niceClasses}
                  saved={savedSet.has(name.toLowerCase())}
                  onToggleSave={toggleSave}
                />
              );
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
          {shortlist.length > 0 && (
            <button
              onClick={() => runNames(shortlist.map((s) => s.name))}
              disabled={running}
              className="mb-1 inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {running && <Loader2 className="h-4 w-4 animate-spin" />} Kolla alla igen
            </button>
          )}
          {shortlist.map((s) => {
            const lbl = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            const com = s.snapshot?.domains?.find((d) => d.domain === `${lbl}.com`);
            return (
              <div key={s.name} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{s.name}</span>
                  <CopyBtn text={s.name} />
                  {com && (
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${com.available === true ? "bg-green-100 text-green-800" : com.available === false ? "bg-red-100 text-red-800" : "bg-gray-200 text-gray-600"}`}>
                      .com {com.available === true ? "ledig" : com.available === false ? "tagen" : "?"}
                    </span>
                  )}
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
            );
          })}
        </div>
      )}

    </div>
  );
}

function ResultCard({
  r,
  scope,
  linkOffices,
  linkClasses,
  saved,
  onToggleSave,
}: {
  r: BrandCheckResult;
  scope: string;
  linkOffices: string;
  linkClasses: string;
  saved: boolean;
  onToggleSave: (r: BrandCheckResult) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-gray-900">{r.name}</span>
        <CopyBtn text={r.name} />
        <button
          onClick={() => onToggleSave(r)}
          title={saved ? "Ta bort från sparade" : "Spara"}
          className={`ml-auto ${saved ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}`}
        >
          <Star className="h-5 w-5" fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Varumärke - öppnas i din webbläsare (funkar alltid, till skillnad från server-koll) */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <Scale className="h-3.5 w-3.5" /> Varumärke
        </p>
        <a
          href={tmviewUrl(r.name, linkOffices, linkClasses)}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          Kolla i TMview{scope ? ` (${scope})` : ""} <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <p className="mt-1 text-[11px] text-gray-400">Förfiltrerad på klass + valda register, bara levande märken. Öppnas i din webbläsare.</p>
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
            ) : d.available === true ? (
              <a
                key={d.domain}
                href={`https://www.namecheap.com/domains/registration/results/?domain=${d.domain}`}
                target="_blank"
                rel="noreferrer"
                title="ledig - köp"
                className="rounded-md bg-green-100 px-2 py-0.5 text-xs text-green-800 underline decoration-green-300 hover:decoration-green-600"
              >
                {d.domain}
              </a>
            ) : (
              <span key={d.domain} className="rounded-md bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                {d.domain}
              </span>
            )
          )}
        </div>
      </div>

      {/* Webben / konkurrenter - riktiga Google-träffar (Serper) */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <Search className="h-3.5 w-3.5" /> Webben - finns ett brand med namnet?
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
          <p className="mt-1 text-xs text-gray-400">Inga tydliga träffar</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { label: "collagen", q: `"${r.name}" collagen` },
            { label: "supplement", q: `"${r.name}" supplement` },
          ].map((g) => (
            <a
              key={g.label}
              href={`https://www.google.com/search?q=${encodeURIComponent(g.q)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-200"
            >
              fler: {g.label} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
