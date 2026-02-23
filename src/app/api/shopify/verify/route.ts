import { NextResponse } from "next/server";

export async function GET() {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!storeUrl || !clientId || !clientSecret) {
    return NextResponse.json(
      { error: "SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET not configured" },
      { status: 500 }
    );
  }

  try {
    // Get access token via client_credentials
    const tokenRes = await fetch(
      `https://${storeUrl}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    );

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`OAuth error: ${tokenRes.status} ${text}`);
    }

    const tokenData = await tokenRes.json();

    // Verify by calling shop.json
    const res = await fetch(
      `https://${storeUrl}/admin/api/2024-01/shop.json`,
      { headers: { "X-Shopify-Access-Token": tokenData.access_token } }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    return NextResponse.json({ shop: data.shop.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connection failed" },
      { status: 500 }
    );
  }
}
