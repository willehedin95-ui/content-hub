import { createServerSupabase } from "@/lib/supabase";
import ProductList from "@/components/products/ProductList";
import StockClient from "@/app/stock/StockClient";
import ProductsTabBar from "@/components/products/ProductsTabBar";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;

  if (tab === "inventory") {
    return (
      <div className="p-8">
        <ProductsTabBar activeTab="inventory" />
        <StockClient />
      </div>
    );
  }

  // Default: products tab
  const db = createServerSupabase();
  const { data: products } = await db
    .from("products")
    .select("*, product_images(id, url, category)")
    .order("created_at", { ascending: true });

  return (
    <div className="p-8">
      <ProductsTabBar activeTab="products" />
      <ProductList initialProducts={products ?? []} />
    </div>
  );
}
