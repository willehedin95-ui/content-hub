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
interface Progress {
  phase: string;
  index?: number;
  total?: number;
}

const VERDICT_COLOR: Record<string, string> = {
  PASS: "bg-green-100 text-green-700",
  WARN: "bg-amber-100 text-amber-700",
  REJECT: "bg-red-100 text-red-700",
};

// Plain-language guidance so you don't have to guess what awareness level to pick.
const AWARENESS_HELP: Record<string, string> = {
  "Unaware": "Känner inte ens problemet än. Störst publik, svårast att konvertera - för skalning senare.",
  "Problem Aware": "Känner smärtan varje dag men vet inte att det finns en lösning. Vanligast starten för kall trafik - börja här.",
  "Solution Aware": "Vet att lösningar finns (kurser, tränare) men inte om din. Sälj varför din metod är annorlunda.",
  "Product Aware": "Känner till din produkt men har inte köpt. Retargeting-territorium: bevis, garanti, invändningar.",
  "Most Aware": "Redo att köpa - behöver bara en knuff. Erbjudande/urgency. Minst publik.",
};

function phaseMessage(p: Progress | null): string {
  if (!p) return "Startar...";
  if (p.phase === "buyer") return "Bygger köparpsykologisk profil...";
  if (p.phase === "hooks") return "Hittar scroll-stoppande hooks...";
  if (p.phase === "swipe") return "DNA-taggar annonsen och skriver om...";
  if (p.phase === "generating") return `Skriver koncept ${(p.index ?? 0) + 1} av ${p.total}...`;
  return "Arbetar...";
}

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
  const [progress, setProgress] = useState<Progress | null>(null);
  const [created, setCreated] = useState<Created[]>([]);
  const [summary, setSummary] = useState<{ created: number; rejected: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [conceptTotal, setConceptTotal] = useState(0);
  const [segments, setSegments] = useState<{ name: string; description: string }[]>([]);
  const [segmentChoice, setSegmentChoice] = useState<string>("custom");
  const [language, setLanguage] = useState("Swedish");
  const [expanded, setExpanded] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (res.ok) {
        setGaps(data.gaps ?? []);
        setConceptTotal(data.total ?? 0);
        setSegments(data.segments ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [product]);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  const canRun = product && (mode === "generate" ? segmentNote.trim().length > 3 : competitorAdText.trim().length > 20);

  async function run() {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setCreated([]);
    setSummary(null);
    setProgress(null);
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const res = await fetch("/api/genesis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, product, segmentNote, competitorAdText, awarenessLevel, angle: angle || undefined, count, language }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Genereringen misslyckades");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.step === "progress") setProgress({ phase: ev.phase as string, index: ev.index as number, total: ev.total as number });
          else if (ev.step === "concept") setCreated((prev) => [...prev, ev.concept as Created]);
          else if (ev.step === "done") setSummary({ created: ev.created as number, rejected: ev.rejected as number });
          else if (ev.step === "warning") setWarnings((prev) => [...prev, ...((ev.errors as string[]) ?? [])]);
          else if (ev.step === "error") setError(ev.message as string);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (timer.current) clearInterval(timer.current);
      setProgress(null);
      setLoading(false);
      loadGaps();
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

        <div className="mt-6 inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {(["generate", "swipe"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={loading}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === m ? "bg-indigo-600 text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              {m === "generate" ? "Generera" : "Swipe konkurrent"}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Produkt</label>
            <select value={product} onChange={(e) => setProduct(e.target.value)} disabled={loading} className={inputCls}>
              {!products.length && <option value="">Laddar...</option>}
              {products.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {mode === "generate" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700">Segment / målgrupp</label>
              {segments.length > 0 && (
                <select
                  value={segmentChoice}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSegmentChoice(v);
                    if (v !== "custom") {
                      const seg = segments.find((s) => s.name === v);
                      if (seg) setSegmentNote(seg.description ? `${seg.name}: ${seg.description}` : seg.name);
                    }
                  }}
                  disabled={loading}
                  className={`${inputCls} mb-2`}
                >
                  <option value="custom">Eget segment (skriv nedan)</option>
                  {segments.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              )}
              <textarea value={segmentNote} onChange={(e) => { setSegmentNote(e.target.value); setSegmentChoice("custom"); }} rows={2} disabled={loading} className={inputCls}
                placeholder="t.ex. Kvinnor 45-60 som gör allt rätt men ser huden förändras och känner sig osynliga" />
              <p className="mt-1 text-xs text-gray-400">Välj ett färdigt segment eller skriv eget - utfall, demografi, känsla.</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700">Konkurrent-annons (text)</label>
              <textarea value={competitorAdText} onChange={(e) => setCompetitorAdText(e.target.value)} rows={5} disabled={loading} className={inputCls}
                placeholder="Klistra in konkurrentens annonstext. Genesis DNA-taggar den (koncept/angle/style/hook) och skriver en ny version för din produkt - behåller strukturen, byter detaljerna." />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Språk</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={loading} className={inputCls}>
              {["Swedish", "Danish", "Norwegian", "German", "English"].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Awareness</label>
              <select value={awarenessLevel} onChange={(e) => setAwarenessLevel(e.target.value)} disabled={loading} className={inputCls}>
                {AWARENESS_LEVELS.map((a) => <option key={a} value={a}>{a === "Problem Aware" ? "Problem Aware (börja här)" : a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Angle</label>
              <select value={angle} onChange={(e) => setAngle(e.target.value)} disabled={loading} className={inputCls}>
                <option value="">Auto - varierar per koncept</option>
                {ANGLES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {mode === "generate" && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Antal</label>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={loading} className={inputCls}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>
          {AWARENESS_HELP[awarenessLevel] && (
            <p className="text-xs text-gray-400">{AWARENESS_HELP[awarenessLevel]}{!angle ? " · Auto-angle roterar Problem-Agitate / Story / Root Cause / Curiosity / Contrarian så batchen testar olika vinklar." : ""}</p>
          )}

          <button onClick={run} disabled={loading || !canRun}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50">
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
                {phaseMessage(progress)} ({elapsed}s)
              </>
            ) : mode === "generate" ? "Generera med Genesis" : "Swipe med Genesis"}
          </button>
          {loading && <p className="text-center text-xs text-gray-400">Koncepten dyker upp nedan allt eftersom de blir klara. Lämna fliken öppen.</p>}
          {!loading && !canRun && product && (
            <p className="text-center text-xs text-gray-400">
              {mode === "generate" ? "Fyll i ett segment för att börja." : "Klistra in konkurrent-annonsens text för att börja."}
            </p>
          )}
        </div>

        {/* Coverage gaps only make sense once there's real test volume - before that it's noise. */}
        {gaps.length > 0 && conceptTotal >= 15 && !loading && (
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

        {warnings.length > 0 && (
          <div className="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-700">
            <div className="font-medium">Varningar under genereringen</div>
            <ul className="mt-1 list-inside list-disc">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {(created.length > 0 || summary) && (
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-medium text-gray-900">
              {created.length} koncept{loading ? " hittills" : " skapade"}
              {summary?.rejected ? <span className="text-sm font-normal text-gray-400"> · {summary.rejected} refuserade av domaren</span> : null}
            </h2>
            {!loading && created.length === 0 && (
              <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-700">Inget koncept klarade domaren. Prova en annan angle eller ett skarpare segment.</div>
            )}
            {created.map((c) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
