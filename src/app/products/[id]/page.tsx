import { createServerSupabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import ProductDetail from "@/components/products/ProductDetail";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: product, error } = await db
    .from("products")
    .select(
      "*, product_images(*), copywriting_guidelines(*), reference_pages(*)"
    )
    .eq("id", id)
    .single();

  if (error || !product) {
    notFound();
  }

  return <ProductDetail initialProduct={product} />;
}
