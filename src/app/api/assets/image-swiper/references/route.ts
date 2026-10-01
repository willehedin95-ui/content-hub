import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

// GET /api/assets/image-swiper/references?product=<slug>
// The product's photos for the reference picker in Swipe Image.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("product");
  if (!slug) return NextResponse.json({ error: "product is required" }, { status: 400 });
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const { data: product } = await db.from("products").select("id").eq("slug", slug).eq("workspace_id", workspaceId).single();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const { data, error } = await db
    .from("product_images")
    .select("id,url,category,description,sort_order")
    .eq("product_id", product.id)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
