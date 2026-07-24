// Shared helpers for the self-hosted form system: answer formatting, ticket
// subject/description building and date-window gating. Ported from the Fillout
// bridge (src/app/api/fillout-to-freshdesk/route.ts) but simplified - our own
// runtime sends structured answers with semantic roles, so no label-sniffing.

import type {
  FormConfig,
  FormField,
  SubmissionAnswer,
  SubmissionFile,
} from "@/types/forms";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(tomt svar)";
  if (typeof value === "string") return value.trim() || "(tomt svar)";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ja" : "Nej";
  if (Array.isArray(value)) {
    if (value.length === 0) return "(tomt svar)";
    return value.map((v) => formatAnswerValue(v)).join(", ");
  }
  return JSON.stringify(value);
}

/** Find the answer for the field with the given semantic role. */
export function findAnswerByRole(
  config: FormConfig,
  answers: SubmissionAnswer[],
  role: string
): string | null {
  const field = config.fields.find((f) => f.role === role);
  if (!field) return null;
  const answer = answers.find((a) => a.key === field.key);
  if (!answer) return null;
  const v = formatAnswerValue(answer.value);
  return v && v !== "(tomt svar)" ? v : null;
}

export function extractEmail(config: FormConfig, answers: SubmissionAnswer[]): string | null {
  const v = findAnswerByRole(config, answers, "email");
  if (v && looksLikeEmail(v)) return v;
  // Fallback: any answer that looks like an email
  for (const a of answers) {
    const s = formatAnswerValue(a.value);
    if (looksLikeEmail(s)) return s;
  }
  return null;
}

export function buildFullName(config: FormConfig, answers: SubmissionAnswer[]): string | null {
  const first = findAnswerByRole(config, answers, "first_name");
  const last = findAnswerByRole(config, answers, "last_name");
  if (first && last) return `${first} ${last}`;
  return first || last || null;
}

export function extractOrderNumber(config: FormConfig, answers: SubmissionAnswer[]): string | null {
  const v = findAnswerByRole(config, answers, "order_number");
  if (!v) return null;
  return v.replace(/^#+/, "").trim() || null;
}

/** "Retur #1234 - William Hedin" style subject. */
export function buildTicketSubject(
  formName: string,
  config: FormConfig,
  answers: SubmissionAnswer[]
): string {
  const kindLabel = config.ticket?.kindLabel;
  const fullName = buildFullName(config, answers);
  const orderNumber = extractOrderNumber(config, answers);

  if (kindLabel) {
    const parts: string[] = [kindLabel];
    if (orderNumber) parts.push(`#${orderNumber}`);
    if (fullName) parts.push(`- ${fullName}`);
    return parts.join(" ");
  }
  if (fullName) return `${formName} - ${fullName}`;
  return `Ny formulärinlämning: ${formName}`;
}

/** HTML ticket description preserving every answer in form order. Files become
 *  clickable links so the helpdesk doesn't mangle raw URLs. */
export function buildTicketDescription(
  formName: string,
  answers: SubmissionAnswer[],
  files: SubmissionFile[],
  meta: { submissionId?: string; submittedAt?: string; market?: string | null }
): string {
  const lines: string[] = [];
  lines.push(`<h2>Ny formulärinlämning</h2>`);
  lines.push(`<p><strong>Formulär:</strong> ${escapeHtml(formName)}</p>`);
  if (meta.market) lines.push(`<p><strong>Marknad:</strong> ${escapeHtml(meta.market.toUpperCase())}</p>`);
  if (meta.submittedAt) {
    const t = new Date(meta.submittedAt);
    if (!isNaN(t.getTime())) {
      lines.push(`<p><strong>Skickat:</strong> ${escapeHtml(t.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }))}</p>`);
    }
  }
  if (meta.submissionId) lines.push(`<p><strong>Submission ID:</strong> ${escapeHtml(meta.submissionId)}</p>`);
  lines.push(`<hr>`);

  for (const a of answers) {
    const question = (a.label || a.key).trim();
    const fieldFiles = files.filter((f) => f.fieldKey === a.key);
    let answerHtml: string;
    if (fieldFiles.length > 0) {
      answerHtml = fieldFiles
        .map((f) => {
          const label = escapeHtml(f.filename || "Bifogad fil");
          const href = escapeHtml(f.url);
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        })
        .join("<br>");
    } else {
      answerHtml = escapeHtml(formatAnswerValue(a.value)).replace(/\n/g, "<br>");
    }
    lines.push(`<p><strong>${escapeHtml(question)}</strong><br>${answerHtml}</p>`);
  }

  // Files not tied to a specific answered field (safety net)
  const orphanFiles = files.filter((f) => !f.fieldKey || !answers.some((a) => a.key === f.fieldKey));
  if (orphanFiles.length > 0) {
    const links = orphanFiles
      .map((f) => `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.filename || "Bifogad fil")}</a>`)
      .join("<br>");
    lines.push(`<p><strong>Bifogade filer</strong><br>${links}</p>`);
  }

  return lines.join("\n");
}

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

/** Evaluate the form's date gate against the delivery_date answer.
 *  Returns null (in window / no gate / unparseable date) or the gate verdict. */
export function evaluateDateGate(
  config: FormConfig,
  answers: SubmissionAnswer[]
): "too_early" | "too_late" | null {
  const gate = config.dateGate;
  if (!gate) return null;
  const raw = findAnswerByRole(config, answers, "delivery_date");
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  const days = daysSince(d);
  if (gate.maxDays !== undefined && days > gate.maxDays) return "too_late";
  if (gate.minDays !== undefined && days < gate.minDays) return "too_early";
  return null;
}

/** Fields that expect a submitted value (everything except static info blocks). */
export function answerableFields(config: FormConfig): FormField[] {
  return config.fields.filter((f) => f.kind !== "info");
}

/** Server-side required-check mirroring the runtime's client-side validation.
 *  Conditional fields (showWhen) are only required when their condition is met. */
export function findMissingRequired(
  config: FormConfig,
  answers: SubmissionAnswer[]
): string[] {
  const valueOf = (key: string): string => {
    const a = answers.find((x) => x.key === key);
    return a ? formatAnswerValue(a.value) : "";
  };
  const missing: string[] = [];
  for (const f of answerableFields(config)) {
    if (!f.required) continue;
    if (f.showWhen) {
      const current = valueOf(f.showWhen.field);
      if (!f.showWhen.in.includes(current)) continue;
    }
    const v = valueOf(f.key);
    if (!v || v === "(tomt svar)" || (f.kind === "checkbox" && v === "Nej")) {
      missing.push(f.label || f.key);
    }
  }
  return missing;
}
