// Shopify integration - uses client_credentials OAuth for auto-refreshing tokens.
//
// Supports multiple stores (one per workspace). Each workspace can define a
// shopify_config in settings; callers pass workspaceId to route to the right
// store. When no workspaceId is passed, falls back to env (SwedishBalance).

// Exchange rates to USD — fetched live from ECB, cached for 6 hours
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, SEK: 0.095, DKK: 0.14, NOK: 0.093, EUR: 1.08,
};
let cachedRates: Record<string, number> | null = null;
let ratesCachedAt = 0;
const RATES_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchLiveRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      "https://api.frankfurter.dev/v1/latest?base=USD&symbols=SEK,DKK,NOK,EUR",
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return FALLBACK_RATES;
    const data = await res.json();
    // API returns rates FROM USD, we need rates TO USD (inverse)
    const rates: Record<string, number> = { USD: 1 };
    for (const [currency, rate] of Object.entries(data.rates as Record<string, number>)) {
      rates[currency] = 1 / rate;
    }
    return rates;
  } catch {
    return FALLBACK_RATES;
  }
}

/** Get exchange rates (cached for 6h, falls back to hardcoded rates) */
export async function getRatesToUSD(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() - ratesCachedAt < RATES_CACHE_MS) {
    return cachedRates;
  }
  cachedRates = await fetchLiveRates();
  ratesCachedAt = Date.now();
  return cachedRates;
}

/** Synchronous conversion using cached or fallback rates */
export function convertToUSD(amount: number, currency: string): number {
  const rates = cachedRates ?? FALLBACK_RATES;
  return amount * (rates[currency] ?? 1);
}

/** Async conversion that ensures fresh rates are loaded */
export async function convertToUSDAsync(amount: number, currency: string): Promise<number> {
  const rates = await getRatesToUSD();
  return amount * (rates[currency] ?? 1);
}

export interface ShopifyOrder {
  id: string;
  order_number: number;
  landing_site: string | null;
  referring_site?: string | null;
  total_price: string;
  currency: string;
  created_at: string;
}

export interface ShopifyCreds {
  storeUrl: string;
  clientId: string;
  clientSecret: string;
  storefrontHost?: string; // e.g. "get-renew.com" or "swedishbalance.se"
}

/** Resolve credentials from env. Returns null if env not configured. */
function envCreds(): ShopifyCreds | null {
  const storeUrl = process.env.SHOPIFY_STORE_URL?.replace(/\/+$/, "") ?? "";
  const clientId = process.env.SHOPIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET ?? "";
  if (!storeUrl || !clientId || !clientSecret) return null;
  return {
    storeUrl: storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`,
    clientId,
    clientSecret,
  };
}

/** Resolve credentials from a workspace's shopify_config. Falls back to env. */
export async function getShopifyCredsForWorkspace(
  workspaceId: string
): Promise<ShopifyCreds | null> {
  const { createServerSupabase } = await import("./supabase-admin");
  const db = createServerSupabase();
  const { data } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const cfg = (data?.settings as Record<string, unknown> | null)?.shopify_config as
    | { store_url?: string; client_id?: string; client_secret?: string; storefront_host?: string; env_fallback?: boolean }
    | undefined;
  if (!cfg) return envCreds();
  if (cfg.env_fallback) return envCreds();
  if (!cfg.store_url || !cfg.client_id || !cfg.client_secret) return null;
  const storeUrl = cfg.store_url.replace(/\/+$/, "");
  return {
    storeUrl: storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`,
    clientId: cfg.client_id,
    clientSecret: cfg.client_secret,
    storefrontHost: cfg.storefront_host,
  };
}

export function isShopifyConfigured(creds?: ShopifyCreds | null): boolean {
  if (creds) return !!(creds.storeUrl && creds.clientId && creds.clientSecret);
  return envCreds() !== null;
}

// Per-credentials token cache (keyed by storeUrl+clientId) so multiple stores
// can be used without cross-contamination.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Get an access token via client_credentials grant.
 * Caches the token per store and refreshes when expired (tokens last 24h).
 */
async function getAccessToken(creds?: ShopifyCreds | null): Promise<string> {
  const resolved = creds ?? envCreds();
  if (!resolved) throw new Error("Shopify credentials not configured");

  const cacheKey = `${resolved.storeUrl}|${resolved.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 300_000) {
    return cached.token;
  }

  const res = await fetch(`${resolved.storeUrl}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: resolved.clientId,
      client_secret: resolved.clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 86399) * 1000,
  });
  return data.access_token as string;
}

/**
 * Fetch orders from Shopify since a given ISO date.
 * Handles pagination via Link header.
 */
export async function fetchOrdersSince(
  sinceISO: string,
  creds?: ShopifyCreds | null
): Promise<ShopifyOrder[]> {
  const resolved = creds ?? envCreds();
  if (!isShopifyConfigured(resolved)) return [];

  const storeUrl = resolved!.storeUrl;
  const token = await getAccessToken(resolved);

  const allOrders: ShopifyOrder[] = [];
  let nextUrl: string | null =
    `${storeUrl}/admin/api/2024-01/orders.json?status=any&created_at_min=${encodeURIComponent(sinceISO)}&fields=id,order_number,landing_site,referring_site,total_price,currency,created_at&limit=250`;

  while (nextUrl) {
    const fetchUrl: string = nextUrl;
    const res: Response = await fetch(fetchUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const orders: ShopifyOrder[] = data.orders ?? [];
    allOrders.push(...orders);

    // Pagination via Link header
    const linkHeader = res.headers.get("Link");
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  return allOrders;
}

// ---- Extended order data for Meta CAPI ----

export interface ShopifyOrderFull extends ShopifyOrder {
  email: string | null;
  phone: string | null;
  billing_address: {
    first_name: string | null;
    last_name: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country_code: string | null;
  } | null;
  customer: {
    id: string;
    email: string | null;
    phone: string | null;
  } | null;
  browser_ip: string | null;
  client_details: {
    user_agent: string | null;
  } | null;
  line_items: Array<{
    sku: string | null;
    product_id: number;
    quantity: number;
  }>;
}

/**
 * Fetch orders with full detail (for Meta CAPI user data hashing).
 * Separate from fetchOrdersSince to avoid breaking existing consumers.
 */
export async function fetchOrdersFullSince(
  sinceISO: string,
  creds?: ShopifyCreds | null
): Promise<ShopifyOrderFull[]> {
  const resolved = creds ?? envCreds();
  if (!isShopifyConfigured(resolved)) return [];

  const storeUrl = resolved!.storeUrl;
  const token = await getAccessToken(resolved);

  const allOrders: ShopifyOrderFull[] = [];
  let nextUrl: string | null =
    `${storeUrl}/admin/api/2024-01/orders.json?status=any&created_at_min=${encodeURIComponent(sinceISO)}&fields=id,order_number,landing_site,referring_site,total_price,currency,created_at,email,phone,billing_address,customer,browser_ip,client_details,line_items&limit=250`;

  while (nextUrl) {
    const fetchUrl: string = nextUrl;
    const res: Response = await fetch(fetchUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const orders: ShopifyOrderFull[] = data.orders ?? [];
    allOrders.push(...orders);

    const linkHeader = res.headers.get("Link");
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  return allOrders;
}

export interface OrderAttribution {
  orders: number;
  revenue: number;
  currency: string;
  /** Attribution source: "utm" means slug came from utm_campaign/utm_term,
   *  "referrer" means inferred from referring_site (UTM stripped). */
  source: "utm" | "referrer" | "mixed";
}

/**
 * Match orders to page slugs.
 * Priority:
 *   1. utm_term on landing_site (Meta ad traffic, utm_source=meta|facebook)
 *   2. utm_campaign on landing_site (direct/organic visitors)
 *   3. Path slug fallback when fbclid/gclid present but UTM stripped
 *   4. NEW: when referring_site is one of our blog domains (halsobladet.com,
 *      smarthelse.dk, helseguiden.com), attribute to a synthetic "__blog__"
 *      slug so we know it came from the blog even when specific article is
 *      unknown (UTMs often stripped by variant selection on PDP).
 * Returns a map: slug -> attribution
 */
export async function getOrdersByPage(
  sinceISO: string,
  creds?: ShopifyCreds | null
): Promise<Map<string, OrderAttribution>> {
  const orders = await fetchOrdersSince(sinceISO, creds);
  const map = new Map<string, OrderAttribution>();
  const BLOG_HOSTS = ["halsobladet.com", "smarthelse.dk", "helseguiden.com"];

  const bump = (slug: string, order: ShopifyOrder, source: OrderAttribution["source"]) => {
    const existing = map.get(slug);
    if (existing) {
      existing.orders += 1;
      existing.revenue += parseFloat(order.total_price) || 0;
      if (existing.source !== source) existing.source = "mixed";
    } else {
      map.set(slug, {
        orders: 1,
        revenue: parseFloat(order.total_price) || 0,
        currency: order.currency,
        source,
      });
    }
  };

  for (const order of orders) {
    let slug: string | null = null;
    let attributionSource: OrderAttribution["source"] = "utm";

    if (order.landing_site) {
      try {
        const url = new URL(order.landing_site, "https://placeholder.com");
        const utmSource = url.searchParams.get("utm_source") || "";
        if (utmSource === "meta" || utmSource === "facebook") {
          slug = url.searchParams.get("utm_term");
        }
        if (!slug) slug = url.searchParams.get("utm_campaign");
        if (!slug && (url.searchParams.has("fbclid") || url.searchParams.has("gclid"))) {
          const pathSlug = url.pathname.replace(/^\/|\/$/g, "");
          if (pathSlug) slug = pathSlug;
        }
      } catch {}
    }

    // Referring-site fallback: UTMs stripped, but we can tell it came from blog
    if (!slug && order.referring_site) {
      try {
        const ref = new URL(order.referring_site);
        if (BLOG_HOSTS.some((h) => ref.hostname.endsWith(h))) {
          // Try to extract the article slug from the referring URL path
          const pathSlug = ref.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean).pop();
          slug = pathSlug || "__blog__";
          attributionSource = "referrer";
        }
      } catch {}
    }

    if (!slug) continue;
    bump(slug, order, attributionSource);
  }

  return map;
}

export async function getConversionsForTest(
  testId: string,
  since: string,
  workspaceId?: string
): Promise<Array<{ variant: string; shopifyOrderId: string; revenue: number; currency: string }>> {
  const { createServerSupabase } = await import("./supabase-admin");
  const db = createServerSupabase();

  // Get the AB test slug - paths are always /{slug}/a/ and /{slug}/b/
  let query = db.from("ab_tests").select("slug").eq("id", testId);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data: test } = await query.single();

  if (!test?.slug) return [];

  const controlPath = `/${test.slug}/a`;
  const variantPath = `/${test.slug}/b`;

  // Fetch orders and match landing_site path to variant
  const creds = workspaceId ? await getShopifyCredsForWorkspace(workspaceId) : null;
  const orders = await fetchOrdersSince(since, creds);
  const conversions: Array<{ variant: string; shopifyOrderId: string; revenue: number; currency: string }> = [];

  for (const order of orders) {
    if (!order.landing_site) continue;
    try {
      const url = new URL(order.landing_site, "https://placeholder.com");
      const orderPath = url.pathname.replace(/\/$/, "");

      let variant: string | null = null;
      if (orderPath === controlPath) variant = "a";
      else if (orderPath === variantPath) variant = "b";

      // Also check UTM params as fallback (utm_campaign=testId, utm_content=a|b)
      if (!variant) {
        const utmCampaign = url.searchParams.get("utm_campaign");
        const utmContent = url.searchParams.get("utm_content");
        if (utmCampaign === testId && (utmContent === "a" || utmContent === "b")) {
          variant = utmContent;
        }
      }

      if (variant) {
        conversions.push({
          variant,
          shopifyOrderId: order.id,
          revenue: parseFloat(order.total_price) || 0,
          currency: order.currency,
        });
      }
    } catch {
      // Skip malformed URLs
    }
  }

  return conversions;
}

// ---- Inventory ----

export interface ShopifyProduct {
  id: number;
  title: string;
  variants: Array<{
    id: number;
    title: string;
    inventory_item_id: number;
    inventory_quantity: number;
    sku: string | null;
  }>;
}

export async function fetchProductsWithInventory(
  creds?: ShopifyCreds | null
): Promise<ShopifyProduct[]> {
  const resolved = creds ?? envCreds();
  if (!isShopifyConfigured(resolved)) return [];

  const storeUrl = resolved!.storeUrl;
  const token = await getAccessToken(resolved);

  const allProducts: ShopifyProduct[] = [];
  let nextUrl: string | null =
    `${storeUrl}/admin/api/2024-01/products.json?fields=id,title,variants&limit=250`;

  while (nextUrl) {
    const fetchUrl: string = nextUrl;
    const res: Response = await fetch(fetchUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    allProducts.push(...(data.products ?? []));

    const linkHeader = res.headers.get("Link");
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  return allProducts;
}
