import { NextResponse } from "next/server";

export async function GET() {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!storeUrl || !token) {
    return NextResponse.json(
      { error: "SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://${storeUrl}/admin/api/2024-01/shop.json`,
      { headers: { "X-Shopify-Access-Token": token } }
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
