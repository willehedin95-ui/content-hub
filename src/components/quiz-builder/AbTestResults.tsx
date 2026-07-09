"use client";
import { useCallback, useEffect, useState } from "react";
import { X, Loader2, Trophy, Crown } from "lucide-react";

type Arm = {
  sessions: number;
  completions: number;
  purchases: number;
  revenue: number;
  completion_rate: number;
  purchase_rate: number;
  aov: number;
};
type Results = {
  experiment: { ownerName: string; variantName: string; split_a: number };
  a: Arm;
  b: Arm;
  significance: { confident: boolean; p_value: number; winner: "a" | "b" | null; enough_data: boolean };
  total_sessions: number;
  total_purchases: number;
  has_offer_metric: boolean;
  started_at: string | null;
};

export function AbTestResults({
  quizId,
  onClose,
  onEnded,
}: {
  quizId: string;
  onClose: () => void;
  onEnded: () => void;
}) {
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [split, setSplit] = useState<number>(50);
  const [busy, setBusy] = useState<null | "a" | "b" | "end">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}/ab-test/results`);
      if (res.ok) {
        const json = (await res.json()) as Results;
        setData(json);
        setSplit(json.experiment.split_a);
      }
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSplit = async (next: number) => {
    setSplit(next);
    await fetch(`/api/quiz/${quizId}/ab-test`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ split_a: next }),
    }).catch(() => {});
  };

  const promote = async (winner: "a" | "b") => {
    setBusy(winner);
    const res = await fetch(`/api/quiz/${quizId}/ab-test/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner }),
    });
    setBusy(null);
    if (res.ok) window.location.reload(); // A's spec may have changed; refresh editor
  };

  const endTest = async () => {
    setBusy("end");
    await fetch(`/api/quiz/${quizId}/ab-test`, { method: "DELETE" }).catch(() => {});
    setBusy(null);
    onEnded();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">A/B-test - resultat</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {loading || !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500 text-sm">
            <Loader2 size={16} className="animate-spin" /> Laddar resultat...
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <Recommendation data={data} />

            {/* Traffic split */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500">Trafik-split</span>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={split}
                onChange={(e) => saveSplit(Number(e.target.value))}
                className="flex-1 accent-indigo-600"
              />
              <span className="tabular-nums text-gray-700 font-medium w-24 text-right">
                {split}% A / {100 - split}% B
              </span>
            </div>

            {/* Scoreboard */}
            <div className="grid grid-cols-2 gap-3">
              <ArmCard title={data.experiment.ownerName} label="Variant A" arm={data.a}
                winner={data.significance.winner === "a"} showOffer={data.has_offer_metric} />
              <ArmCard title={data.experiment.variantName} label="Variant B" arm={data.b}
                winner={data.significance.winner === "b"} showOffer={data.has_offer_metric} />
            </div>

            <p className="text-xs text-gray-400">
              {data.total_sessions.toLocaleString("sv-SE")} sessions i testet &middot;{" "}
              {data.total_purchases} köp &middot; en URL, jämn slantsingling
            </p>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-500 mr-auto">Avsluta testet:</span>
              <button type="button" onClick={() => promote("a")} disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                {busy === "a" ? <Loader2 size={13} className="animate-spin" /> : <Crown size={13} />} A vinner
              </button>
              <button type="button" onClick={() => promote("b")} disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                {busy === "b" ? <Loader2 size={13} className="animate-spin" /> : <Crown size={13} />} B vinner
              </button>
              <button type="button" onClick={endTest} disabled={busy !== null}
                className="px-3 py-1.5 rounded text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">
                {busy === "end" ? <Loader2 size={13} className="animate-spin" /> : "Avbryt utan vinnare"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Recommendation({ data }: { data: Results }) {
  const { significance: s, a, b } = data;
  let tone = "bg-gray-50 text-gray-600 border-gray-200";
  let msg: string;
  if (!s.enough_data) {
    msg = "För tidigt att avgöra - kör tills varje variant har minst ~30 sessions.";
  } else if (s.confident && s.winner) {
    const wName = s.winner === "a" ? data.experiment.ownerName : data.experiment.variantName;
    const lift = s.winner === "b"
      ? pct(b.purchase_rate - a.purchase_rate)
      : pct(a.purchase_rate - b.purchase_rate);
    tone = "bg-green-50 text-green-800 border-green-200";
    msg = `${s.winner.toUpperCase()} (${wName}) vinner med ${lift} högre köp-rate - statistiskt säkerställt (p=${s.p_value}). Gör den till vinnare.`;
  } else {
    msg = `Ingen tydlig vinnare än (p=${s.p_value}). Kör längre eller ta en större sväng.`;
  }
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>{msg}</div>;
}

function ArmCard({
  title,
  label,
  arm,
  winner,
  showOffer,
}: {
  title: string;
  label: string;
  arm: Arm;
  winner: boolean;
  showOffer: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${winner ? "border-green-300 bg-green-50/50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">{label}</div>
          <div className="text-sm font-medium text-gray-900 truncate" title={title}>{title}</div>
        </div>
        {winner && <Crown size={16} className="text-green-600 shrink-0" />}
      </div>
      <dl className="space-y-1.5 text-sm">
        <Row k="Sessions" v={arm.sessions.toLocaleString("sv-SE")} />
        {showOffer && <Row k="Nått offer" v={`${arm.completion_rate}%`} />}
        <Row k="Köp" v={String(arm.purchases)} />
        <Row k="Köp-rate" v={`${arm.purchase_rate}%`} strong />
        <Row k="Intäkt" v={`${arm.revenue.toLocaleString("sv-SE")} kr`} />
        <Row k="AOV" v={`${arm.aov.toLocaleString("sv-SE")} kr`} />
      </dl>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{k}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-gray-900" : "text-gray-700"}`}>{v}</dd>
    </div>
  );
}

function pct(n: number): string {
  return `${Math.abs(Math.round(n * 10) / 10)} pp`;
}
