import { createServerSupabase } from "@/lib/supabase";
import SwiperClient from "@/components/swiper/SwiperClient";

export default async function SwiperPage() {
  const db = createServerSupabase();
  const { data: products } = await db
    .from("products")
    .select("id, slug, name, product_images(*)")
    .order("created_at", { ascending: true });

  return <SwiperClient products={products ?? []} />;
}
