// Self-hosted support forms (replaces Fillout, phase 1: Envana).
// A form is a config-driven JSON document rendered by public/forms-embed/v1.js
// on the Shopify storefront. Submissions are persisted FIRST (form_submissions),
// then delivered to the workspace's helpdesk by src/lib/form-delivery.ts.

/** Semantic role of a field - lets the ticket builder extract email/name/order
 *  number/delivery date without keyword-sniffing labels (the old Fillout bridge
 *  had to guess from Swedish/Norwegian/Danish label variants). */
export type FormFieldRole =
  | "email"
  | "first_name"
  | "last_name"
  | "order_number"
  | "delivery_date"
  | "message";

/** Show a field only when another field's value is in the list. */
export type FormCondition = { field: string; in: string[] };

export type FormEnding = { title: string; html?: string };

export interface FormFieldBase {
  key: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  role?: FormFieldRole;
  showWhen?: FormCondition;
}

export type FormField =
  // Static info banner (the blue Fillout-style info blocks)
  | ({ kind: "info"; html: string } & FormFieldBase)
  | ({ kind: "text" | "email" | "textarea" | "date" } & FormFieldBase)
  | ({ kind: "select" | "radio"; options: { value: string; label: string }[] } & FormFieldBase)
  // Checkbox with confirmation text (godkännande)
  | ({ kind: "checkbox"; text: string } & FormFieldBase)
  | ({ kind: "file"; accept?: string; maxFiles?: number } & FormFieldBase);

/** Date-window gating (retur 0-14 dagar, garanti 60-90 dagar). Evaluated
 *  server-side on the field with role "delivery_date". Out-of-window
 *  submissions are stored with gate_status + delivery_status "skipped"
 *  (the old bridge dropped them without a trace). Ångerrätt has NO gate -
 *  a statutory withdrawal must always be accepted. */
export interface FormDateGate {
  minDays?: number;
  maxDays?: number;
}

export interface FormTicketConfig {
  /** Subject prefix, e.g. "Retur", "Garanti", "Kontakt", "Ångerrätt" */
  kindLabel?: string;
  /** Freshdesk priority: 1 Low, 2 Medium, 3 High. Default 1 (ångerrätt: 3). */
  priority?: number;
  tags?: string[];
}

export interface FormConfig {
  title?: string;
  /** HTML intro shown above the fields */
  intro?: string;
  submitLabel?: string;
  fields: FormField[];
  endings: {
    success: FormEnding;
    too_early?: FormEnding;
    too_late?: FormEnding;
  };
  dateGate?: FormDateGate;
  ticket?: FormTicketConfig;
}

export interface FormRow {
  id: string;
  workspace_id: string;
  slug: string;
  market: string;
  name: string;
  status: string;
  config: FormConfig;
  created_at: string;
  updated_at: string;
}

/** One answer as submitted by the embed runtime. Order is preserved and used
 *  verbatim in the ticket description. */
export interface SubmissionAnswer {
  key: string;
  label: string;
  value: unknown;
}

export interface SubmissionFile {
  url: string;
  filename?: string;
  fieldKey?: string;
}

export type DeliveryStatus = "pending" | "delivered" | "failed" | "skipped";

export interface FormSubmissionRow {
  id: string;
  form_id: string;
  workspace_id: string;
  market: string | null;
  client_submission_id: string;
  payload: SubmissionAnswer[];
  email: string | null;
  name: string | null;
  order_number: string | null;
  files: SubmissionFile[];
  meta: Record<string, unknown>;
  is_test: boolean;
  gate_status: "too_early" | "too_late" | null;
  delivery_status: DeliveryStatus;
  delivery_attempts: number;
  next_retry_at: string | null;
  delivered_at: string | null;
  ticket_id: string | null;
  last_error: string | null;
  created_at: string;
}

/** Per-workspace helpdesk routing, stored in workspaces.settings.forms_helpdesk.
 *  Swapping helpdesk provider = new adapter in form-delivery.ts + point this
 *  config at it. Freshdesk accounts reuse the existing FRESHDESK_RENEW_* /
 *  FRESHDESK_SB_* env vars. */
export type HelpdeskConfig =
  | { type: "freshdesk"; account: "renew" | "sb" }
  | { type: "email"; to: string };
