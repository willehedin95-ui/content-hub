import { createServerSupabase } from "@/lib/supabase";
import ProductList from "@/components/products/ProductList";

export default async function ProductsPage() {
  const db = createServerSupabase();
  const { data: products } = await db
    .from("products")
    .select("*, product_images(id, url, category)")
    .order("created_at", { ascending: true });

  return <ProductList initialProducts={products ?? []} />;
}
