// Freshdesk API integration for support ticket data

export function isFreshdeskConfigured(): boolean {
  return !!(process.env.FRESHDESK_API_KEY && process.env.FRESHDESK_DOMAIN);
}

function getBaseUrl(): string {
  return `https://${process.env.FRESHDESK_DOMAIN}.freshdesk.com/api/v2`;
}

function getHeaders(): Record<string, string> {
  const key = process.env.FRESHDESK_API_KEY!;
  const encoded = Buffer.from(`${key}:X`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/json",
  };
}

async function freshdeskFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Freshdesk API error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

export interface FreshdeskTicket {
  id: number;
  subject: string;
  description_text: string | null;
  status: number; // 2=Open, 3=Pending, 4=Resolved, 5=Closed
  priority: number; // 1=Low, 2=Medium, 3=High, 4=Urgent
  type: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  stats?: {
    first_responded_at: string | null;
  };
}

export const STATUS_LABELS: Record<number, string> = {
  2: "Open",
  3: "Pending",
  4: "Resolved",
  5: "Closed",
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export async function fetchRecentTickets(days: number): Promise<FreshdeskTicket[]> {
  if (!isFreshdeskConfigured()) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const allTickets: FreshdeskTicket[] = [];
  let page = 1;
  const maxPages = 5;

  while (page <= maxPages) {
    const tickets = await freshdeskFetch<FreshdeskTicket[]>(
      `/tickets?updated_since=${sinceStr}&include=stats&per_page=100&page=${page}`
    );
    allTickets.push(...tickets);
    if (tickets.length < 100) break;
    page++;
  }
  return allTickets;
}

export async function fetchOpenTickets(): Promise<FreshdeskTicket[]> {
  if (!isFreshdeskConfigured()) return [];
  const [open, pending] = await Promise.all([
    freshdeskFetch<FreshdeskTicket[]>(`/tickets?filter=open&include=stats&per_page=100`),
    freshdeskFetch<FreshdeskTicket[]>(`/tickets?filter=pending&include=stats&per_page=100`),
  ]);
  return [...open, ...pending];
}
