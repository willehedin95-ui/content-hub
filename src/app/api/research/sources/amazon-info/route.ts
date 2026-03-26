import { NextRequest, NextResponse } from "next/server";
import { extractAsin } from "@/lib/amazon";
import { scrapeAmazonReviewsViaApify } from "@/lib/apify";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const input = url.searchParams.get("asin") ?? "";
  const marketplace = url.searchParams.get("marketplace") ?? "us";

  if (!input) {
    return NextResponse.json({ error: "asin param required" }, { status: 400 });
  }

  const asin = extractAsin(input);
  if (!asin) {
    return NextResponse.json({ error: "Invalid ASIN" }, { status: 400 });
  }

  try {
    // Run actor with maxReviews=1 just to get product info
    const result = await scrapeAmazonReviewsViaApify(asin, {
      marketplace,
      maxReviews: 1,
    });

    return NextResponse.json({
      asin,
      title: result.productInfo?.title ?? null,
      totalReviews: result.productInfo?.totalReviews ?? null,
    });
  } catch {
    return NextResponse.json({ asin, title: null, totalReviews: null });
  }
}
