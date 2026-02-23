import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET() {
  const db = createServerSupabase();

  const { data, error } = await db
    .from("products")
    .select("*, product_images(id, url, category)")
    .order("created_at", { ascending: true });

  if (error) {
    return safeError(error, "Failed to fetch products");
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const body = await req.json();
  const { slug, name } = body;

  if (!slug || !name) {
    return NextResponse.json(
      { error: "slug and name are required" },
      { status: 400 }
    );
  }

  const { data, error } = await db
    .from("products")
    .insert({
      slug,
      name,
      tagline: body.tagline || null,
      description: body.description || null,
      benefits: body.benefits || [],
      usps: body.usps || [],
      claims: body.claims || [],
      certifications: body.certifications || [],
      ingredients: body.ingredients || null,
      price_info: body.price_info || {},
      target_audience: body.target_audience || null,
      competitor_keywords: body.competitor_keywords || [],
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to create product");
  }

  return NextResponse.json(data, { status: 201 });
}
