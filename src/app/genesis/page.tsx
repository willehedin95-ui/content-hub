"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ANGLES, AWARENESS_LEVELS } from "@/types";
import { useProducts } from "@/hooks/useProducts";

interface Created {
  job_id: string;
  concept_number: number;
  name: string;
  verdict: string;
  score: number;
  angle: string;
  awareness: string;
  hook: string;
  preview: string;
  issues: string[];
}
interface Gap {
  angle: string;
  awareness: string;
  count: number;
}

const VERDICT_COLOR: Record<string, string> = {
  PASS: "bg-green-100 text-green-700",
  WARN: "bg-amber-100 text-amber-700",
  REJECT: "bg-red-100 text-red-700",
};

const LOADING_MESSAGES = [
  "Bygger köparpsykologisk profil...",
  "Hittar scroll-stoppande hooks...",
  "Skriver annonstexten...",
  "Domaren granskar copyn...",
  "Regenererar det som inte höll...",
  "Strukturerar konceptet...",
];

export default function GenesisPage() {
  const products = useProducts();
  const [mode, setMode] = useState<"generate" | "swipe">("generate");
  const [product, setProduct] = useState("");
  const [segmentNote, setSegmentNote] = useState("");
  const [competitorAdText, setCompetitorAdText] = useState("");
  const [awarenessLevel, setAwarenessLevel] = useState<string>("Problem Aware");
  const [angle, setAngle] = useState<string>("");
  const [count, setCount] = useState(2);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [result, setResult] = useState<{ created: Created[]; rejected?: number; errors?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  // default product once loaded
  useEffect(() => {
    if (!product && products.length) {
      setProduct(products.find((p) => p.value === "hydro13")?.value ?? products[0].value);
    }
  }, [products, product]);

  const loadGaps = useCallback(async () => {
    if (!product) return;
    try {
      const res = await fetch(`/api/genesis/generate?product=${encodeURIComponent(product)}`);
      const data = await res.json();
      if (res.ok) setGaps(data.gaps ?? []);
    } catch {
      /* ignore */
    }
  }, [product]);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  function startTickers() {
    setElapsed(0);
    setLoadingMsg(LOADING_MESSAGES[0]);
    let i = 0;
    timers.current.push(setInterval(() => setElapsed((e) => e + 1), 1000));
    timers.current.push(
      setInterval(() => {
        i = (i + 1) % LOADING_MESSAGES.length;
        setLoadingMsg(LOADING_MESSAGES[i]);
      }, 6000),
    );
  }
  function stopTickers() {
    timers.current.forEach(clearInterval);
    timers.current = [];
  }

  const canRun = product && (mode === "generate" ? segmentNote.trim().length > 3 : competitorAdText.trim().length > 20);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    startTickers();
    try {
      const res = await fetch("/api/genesis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, product, segmentNote, competitorAdText, awarenessLevel, angle: angle || undefined, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Genereringen misslyckades");
      setResult(data);
      loadGaps();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      stopTickers();
      setLoading(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-gray-900">Genesis</h1>
        <p className="mt-1 text-sm text-gray-500">
          Nya ad-koncept via Copy Coders tränade bottar. Varje koncept genereras, granskas av en domare och
          regenereras om det inte håller. Godkända koncept landar i din koncept-lista och börjar generera bilder.
        </p>

        {/* mode tabs */}
        <div className="mt-6 inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {(["generate", "swipe"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === m ? "bg-indigo-600 text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              {m === "generate" ? "Generera" : "Swipe konkurrent"}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Produkt</label>
            <select value={product} onChange={(e) => setProduct(e.target.value)} className={inputCls}>
              {!products.length && <option value="">Laddar...</option>}
              {products.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {mode === "generate" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700">Segment / målgrupp</label>
              <textarea value={segmentNote} onChange={(e) => setSegmentNote(e.target.value)} rows={2} className={inputCls}
                placeholder="t.ex. Kvinnor 45-60 som gör allt rätt men ser huden förändras och känner sig osynliga" />
              <p className="mt-1 text-xs text-gray-400">Beskriv vem annonsen ska tala till - utfall, demografi, känsla. Ju skarpare desto bättre copy.</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700">Konkurrent-annons (text)</label>
              <textarea value={competitorAdText} onChange={(e) => setCompetitorAdText(e.target.value)} rows={5} className={inputCls}
                placeholder="Klistra in konkurrentens annonstext. Genesis DNA-taggar den (koncept/angle/style/hook) och skriver en ny version för din produkt - behåller strukturen, byter detaljerna." />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Awareness</label>
              <select value={awarenessLevel} onChange={(e) => setAwarenessLevel(e.target.value)} className={inputCls}>
                {AWARENESS_LEVELS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Angle</label>
              <select value={angle} onChange={(e) => setAngle(e.target.value)} className={inputCls}>
                <option value="">Auto</option>
                {ANGLES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {mode === "generate" && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Antal</label>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputCls}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>

          <button onClick={run} disabled={loading || !canRun}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50">
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
                {loadingMsg} ({elapsed}s)
              </>
            ) : mode === "generate" ? "Generera med Genesis" : "Swipe med Genesis"}
          </button>
          {loading && <p className="text-center text-xs text-gray-400">Tar oftast 1-3 minuter (tränade bottar körs en i taget). Lämna fliken öppen.</p>}
          {!loading && !canRun && product && (
            <p className="text-center text-xs text-gray-400">
              {mode === "generate" ? "Fyll i ett segment för att börja." : "Klistra in konkurrent-annonsens text för att börja."}
            </p>
          )}
        </div>

        {/* coverage gaps */}
        {gaps.length > 0 && !loading && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-medium text-gray-700">Luckor att sikta på</div>
            <p className="text-xs text-gray-400">Otestade angle x awareness-kombinationer för den här produkten. Klicka för att fylla i.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {gaps.map((g, i) => (
                <button key={i} onClick={() => { setMode("generate"); setAngle(g.angle); setAwarenessLevel(g.awareness); }}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100">
                  {g.angle} · {g.awareness}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {result && (
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-medium text-gray-900">
              {result.created.length} koncept skapade
              {result.rejected ? <span className="text-sm font-normal text-gray-400"> · {result.rejected} refuserade av domaren</span> : null}
            </h2>
            {result.created.length === 0 && (
              <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-700">Inget koncept klarade domaren. Prova en annan angle eller ett skarpare segment.</div>
            )}
            {result.created.map((c) => (
              <div key={c.job_id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">#{c.concept_number} · {c.name}</div>
                    <div className="mt-0.5 text-xs text-gray-400">{c.angle} · {c.awareness}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${VERDICT_COLOR[c.verdict] || "bg-gray-100 text-gray-600"}`}>
                    {c.verdict} {c.score}/10
                  </span>
                </div>
                {c.hook && <div className="mt-2 text-sm italic text-gray-600">&ldquo;{c.hook}&rdquo;</div>}
                {expanded === c.job_id && (
                  <div className="mt-2 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700">{c.preview}...</div>
                )}
                {c.issues.length > 0 && expanded === c.job_id && (
                  <ul className="mt-2 list-inside list-disc text-xs text-amber-600">
                    {c.issues.map((iss, k) => <li key={k}>{iss}</li>)}
                  </ul>
                )}
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <button onClick={() => setExpanded(expanded === c.job_id ? null : c.job_id)} className="text-gray-500 hover:text-gray-900">
                    {expanded === c.job_id ? "Dölj" : "Visa copy"}
                  </button>
                  <Link href={`/images/${c.job_id}`} className="font-medium text-indigo-600 hover:text-indigo-800">Öppna koncept →</Link>
                </div>
              </div>
            ))}
            {result.errors && result.errors.length > 0 && (
              <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-700">{result.errors.join(" · ")}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
