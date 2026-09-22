// QR-koden till kortet i paketet.
//
// GET /api/forms/qr?url=<mal>&format=svg|png&size=<px>
//
// SVG ar standard for att koden ska tryckas. En PNG later tryckeriet skala upp
// den till nagot som blir grynigt; en vektor gor inte det.
//
// Felkorrigering "M" (~15 %) och inte "L": kortet ligger i en kartong som
// trycks, skavs och hanteras, och marginalen kostar bara nagra moduler.
//
// Routen ar INTE publik - den ligger bakom hubbens inloggning som allt annat
// utanfor formulars-API:et. En oppen QR-generator pa var egen doman ar ett
// givet verktyg for nagon som vill lata en phishing-lank se ut som var.

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export const runtime = "nodejs";

/** Bara vara egna varden far kodas. En QR-kod ar oläslig for manniskan som
 *  scannar den, sa en kod fran var doman som leder nagon annanstans ar precis
 *  det en angripare vill ha. */
const TILLATNA_VARDAR = new Set([
  "shopenvana.com",
  "www.shopenvana.com",
  "content-hub-nine-theta.vercel.app",
]);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const url = (q.get("url") || "").trim();
  const format = (q.get("format") || "svg").toLowerCase();
  const size = Math.min(Math.max(parseInt(q.get("size") || "1024", 10) || 1024, 128), 4096);

  if (!url) return new NextResponse("url saknas", { status: 400 });
  let mal: URL;
  try {
    mal = new URL(url);
  } catch {
    return new NextResponse("ogiltig url", { status: 400 });
  }
  if (mal.protocol !== "https:" || !TILLATNA_VARDAR.has(mal.hostname)) {
    return new NextResponse("varden ar inte tillaten", { status: 400 });
  }

  const gemensamt = {
    errorCorrectionLevel: "M" as const,
    margin: 2,
    color: { dark: "#320d01", light: "#fefaf8" },
  };

  if (format === "png") {
    const buf = await QRCode.toBuffer(mal.toString(), { ...gemensamt, type: "png", width: size });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": 'inline; filename="envana-qr.png"',
      },
    });
  }

  const svg = await QRCode.toString(mal.toString(), { ...gemensamt, type: "svg", width: size });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": 'inline; filename="envana-qr.svg"',
    },
  });
}
