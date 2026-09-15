// Signerade kundlankar for formularsystemet.
//
// Problemet: formularet ar anonymt tills kunden skrivit sin e-post. Darfor kan
// det inte visa hennes tidigare bilder, inte hoppa over e-poststeget och inte
// anpassa sin copy - aven nar hon kommer fran ett mail som VET vem hon ar.
//
// Losningen ar en token som bar adressen och ar signerad, sa den varken gar att
// gissa eller andra. Den ar STATELESS med flit: ingen tabell att halla i synk,
// och samma adress ger alltid samma token, sa en lank fran ett gammalt mail
// fortsatter fungera.
//
// Vad den skyddar: uppslaget av en kunds bildserie. Bilderna sjalva ligger i en
// publik bucket med ogissbara uuid-sokvagar - det ar URL:en som ar hemligheten
// dar. Token hindrar att nagon skriver in en adress och far ut nagon annans
// ansiktsbilder, vilket ar precis vad ett e-postbaserat uppslag hade tillatit.

import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.FORMS_TOKEN_SECRET?.trim();
  if (!s) throw new Error("FORMS_TOKEN_SECRET saknas");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest()).slice(0, 27);
}

/** Token for en kund. Adressen normaliseras sa "Anna@X.se" och "anna@x.se"
 *  ger samma token - annars far samma person tva serier. */
export function tokenForEmail(email: string): string {
  const norm = email.trim().toLowerCase();
  const payload = b64url(Buffer.from(norm, "utf-8"));
  return `${payload}.${sign(payload)}`;
}

/** Adressen ur en token, eller null om signaturen inte stammer. */
export function emailFromToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // Jamforelse i konstant tid: en tidsskillnad rader for rader lacker hur
  // manga tecken av signaturen som stammer, och da gar den att gissa fram.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const email = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}
