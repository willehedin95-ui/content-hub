"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, QrCode, Download, ImageOff, Gift } from "lucide-react";

// Malet QR-koden pekar pa. Butiksdomanen och inte hubbens Vercel-adress: iOS
// visar URL:en i bannern INNAN man tappar pa den, och en vercel.app-adress dar
// ser ut som nat man inte ska rora. ?k=qr later oppningen raknas till ratt
// kalla, ?steg=1 star ut i klartext for att koden trycks en gang och sedan
// lever for alltid - en fallback i en config kan nagon andra.
const QR_MAL = "https://shopenvana.com/pages/resa?k=qr&steg=1";

type Tratt = { steg: string; namn: string; oppningar: number; unika: number; inskick: number; andel: number | null };
type Beloning = { typ: string; belopp: number; rabattkod: string | null; beviljad_at: string } | null;
type Deltagare = {
  email: string;
  forsta: string;
  steg: Record<string, { datum: string; bild: string | null }>;
  svar: { fraga: string; varde: string }[];
  antalBilder: number;
  beloning: Beloning;
};
type Data = { loggStart: string | null; tratt: Tratt[]; kallor: Record<string, number>; deltagare: Deltagare[]; antalTest: number };

const dag = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });

function Bildruta({ bild, namn, datum }: { bild: string | null; namn: string; datum?: string }) {
  // En rad kan peka pa en fil som inte finns kvar i bucketen. Da ska rutan se
  // ut som en tom ruta, inte som en trasig bild med alt-texten hangande i sig.
  const [trasig, setTrasig] = useState(false);
  const visa = bild && !trasig;
  return (
    <div className="w-[76px] shrink-0">
      <div className="aspect-[3/4] overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {visa ? (
          <a href={bild} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bild}
              alt={namn}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setTrasig(true)}
            />
          </a>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <ImageOff className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-1 text-center text-[10px] font-medium text-gray-500">{namn}</div>
      {datum && <div className="text-center text-[10px] text-gray-400">{dag(datum)}</div>}
    </div>
  );
}

export default function ProgressbildOversikt() {
  const [data, setData] = useState<Data | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);

  const load = useCallback(async () => {
    setLaddar(true);
    try {
      const r = await fetch("/api/forms/progressbild-oversikt");
      if (!r.ok) throw new Error(`API svarade ${r.status}`);
      setData((await r.json()) as Data);
      setFel(null);
    } catch (e) {
      setFel(e instanceof Error ? e.message : "okänt fel");
    } finally {
      setLaddar(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const qrBild = `/api/forms/qr?url=${encodeURIComponent(QR_MAL)}&format=svg&size=512`;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <QrCode className="h-6 w-6" /> Progressbilder
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            60-dagarsresan för Envana: QR-koden på kortet i paketet, hur många som tar sig in, och
            vad de svarat.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${laddar ? "animate-spin" : ""}`} /> Uppdatera
        </button>
      </div>

      {fel && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Kunde inte hämta översikten: {fel}
        </div>
      )}

      {/* ---------------------------------------------------------------- QR */}
      <div className="mb-4 flex flex-wrap items-center gap-5 rounded-xl border border-gray-200 bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrBild} alt="QR-kod till progressbildsflödet" className="h-36 w-36 rounded-lg border border-gray-100" />
        <div className="min-w-[260px] flex-1">
          <div className="text-sm font-semibold text-gray-900">QR-koden till kortet i paketet</div>
          <p className="mt-1 text-xs text-gray-500">
            Pekar på butikens egen domän, inte hubben. iOS visar adressen i bannern innan man tappar,
            och en vercel.app-adress där ser ut som något man inte ska röra.
          </p>
          <code className="mt-2 block break-all rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700">
            {QR_MAL}
          </code>
          <div className="mt-2.5 flex flex-wrap gap-3 text-xs">
            <a
              href={`/api/forms/qr?url=${encodeURIComponent(QR_MAL)}&format=svg&size=2048`}
              download="envana-qr.svg"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" /> SVG för tryck
            </a>
            <a
              href={`/api/forms/qr?url=${encodeURIComponent(QR_MAL)}&format=png&size=2048`}
              download="envana-qr.png"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" /> PNG 2048px
            </a>
            <a
              href={QR_MAL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              Öppna sidan
            </a>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ tratten */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <span className="font-semibold text-gray-900">Tratten</span>
          <span className="ml-2 text-xs text-gray-400">
            öppningar räknas när sidan laddas, inte när koden scannas - en scan som aldrig tappas gör
            ingen förfrågan och går inte att räkna
          </span>
        </div>
        <div className="grid gap-px bg-gray-100 sm:grid-cols-3">
          {(data?.tratt ?? []).map((t) => (
            <div key={t.steg} className="bg-white px-4 py-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{t.namn}</div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">{t.inskick}</span>
                <span className="text-sm text-gray-500">inskickade</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {t.unika} öppnade{t.oppningar !== t.unika ? ` (${t.oppningar} laddningar)` : ""}
                {t.andel !== null && (
                  <span className={`ml-1.5 font-medium ${t.andel >= 50 ? "text-green-700" : "text-amber-700"}`}>
                    {t.andel}% gick vidare
                  </span>
                )}
              </div>
            </div>
          ))}
          {!laddar && !data?.tratt.length && (
            <div className="bg-white px-4 py-6 text-sm text-gray-400 sm:col-span-3">Inget att visa än.</div>
          )}
        </div>
        {data && !data.loggStart && data.tratt.some((t) => t.inskick > 0) && (
          <div className="border-t border-gray-100 px-4 py-2.5 text-xs text-amber-700">
            Öppningsloggen är ny och tom än. Inskicken ovan gjordes innan den fanns, så de saknar
            öppningstal - det fylls i från och med nästa besökare.
          </div>
        )}
        {data && Object.keys(data.kallor).length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
            <span className="text-gray-400">Källor:</span>
            {Object.entries(data.kallor).map(([k, n]) => (
              <span key={k} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
                {k} {n}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- deltagarna */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <span className="font-semibold text-gray-900">Deltagare ({data?.deltagare.length ?? 0})</span>
          {!!data?.antalTest && (
            <span className="text-xs text-gray-400">{data.antalTest} testinskick dolda</span>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {(data?.deltagare ?? []).map((d) => (
            <div key={d.email} className="flex flex-wrap items-start gap-4 px-4 py-4">
              <div className="flex gap-2">
                {["1", "2", "3"].map((s) => (
                  <Bildruta
                    key={s}
                    bild={d.steg[s]?.bild ?? null}
                    namn={s === "1" ? "Dag 1" : s === "2" ? "Dag 30" : "Dag 60"}
                    datum={d.steg[s]?.datum}
                  />
                ))}
              </div>
              <div className="min-w-[220px] flex-1">
                <div className="text-sm font-medium text-gray-900">{d.email}</div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {d.antalBilder} av 3 bilder · började {dag(d.forsta)}
                </div>
                {d.svar.length > 0 && (
                  <dl className="mt-2 space-y-1">
                    {d.svar.map((s) => (
                      <div key={s.fraga} className="flex flex-wrap gap-1.5 text-xs">
                        <dt className="text-gray-400">{s.fraga}:</dt>
                        <dd className="font-medium text-gray-700">{s.varde}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {d.beloning && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                    <Gift className="h-3.5 w-3.5" />
                    {d.beloning.typ === "loop-avdrag"
                      ? `${d.beloning.belopp} kr på nästa leverans`
                      : d.beloning.typ === "rabattkod"
                        ? `${d.beloning.belopp} kr, kod ${d.beloning.rabattkod ?? "saknas"}`
                        : `${d.beloning.belopp} kr - kräver manuell hantering`}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!laddar && !data?.deltagare.length && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Ingen har laddat upp någon bild än.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
