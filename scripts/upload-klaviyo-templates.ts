/**
 * Laddar upp progressbildsflodets mallar till Klaviyo som CODE-mallar.
 *
 * CODE och inte drag-and-drop: en SYSTEM_DRAGGABLE-mall gar inte att uppdatera
 * via API (400 "Unsupported template type"), sa all vidare redigering hade
 * tvingats gora for hand i UI:t. Se klaviyo-api-limits i memory.
 *
 * Idempotent: finns en mall med samma namn uppdateras den i stallet for att en
 * kopia skapas.
 *
 *   npx tsx scripts/upload-klaviyo-templates.ts [--dry]
 */
process.loadEnvFile?.(".env.local");
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "emails/progressbild";
const PREFIX = "Progressbild - ";
const REVISION = "2025-07-15";
const DRY = process.argv.includes("--dry");

const NAMES: Record<string, string> = {
  kvittens: "kvittens (alla tre stegen)",
  paminnelse: "paminnelse nasta bild",
  slutmail: "slutmail dag 60 + samtycke",
};

async function kv(path: string, init: RequestInit = {}) {
  const key = process.env.KLAVIYO_ENVANA_API_KEY?.trim();
  if (!key) throw new Error("KLAVIYO_ENVANA_API_KEY saknas");
  const res = await fetch("https://a.klaviyo.com/api" + path, {
    ...init,
    headers: {
      Authorization: "Klaviyo-API-Key " + key,
      revision: REVISION,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function existingByName(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let url: string | null = "/templates/";
  while (url) {
    const page: { data: { id: string; attributes: { name: string } }[]; links?: { next?: string } } =
      await kv(url);
    for (const t of page.data) map.set(t.attributes.name, t.id);
    const next = page.links?.next;
    url = next ? next.replace("https://a.klaviyo.com/api", "") : null;
  }
  return map;
}

async function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".klaviyo.html"));
  const existing = DRY ? new Map<string, string>() : await existingByName();

  for (const file of files) {
    const slug = file.replace(".klaviyo.html", "");
    const name = PREFIX + (NAMES[slug] ?? slug);
    const html = readFileSync(join(DIR, file), "utf-8");
    if (DRY) {
      console.log(`[dry] ${name} (${html.length} tecken)`);
      continue;
    }
    const id = existing.get(name);
    if (id) {
      await kv(`/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { type: "template", id, attributes: { name, html } } }),
      });
      console.log(`uppdaterad: ${name} (${id})`);
    } else {
      const created = await kv("/templates/", {
        method: "POST",
        body: JSON.stringify({
          data: { type: "template", attributes: { name, editor_type: "CODE", html } },
        }),
      });
      console.log(`skapad: ${name} (${created.data.id})`);
    }
  }
}
main().catch((e) => { console.error("FEL:", e?.message || e); process.exit(1); });
