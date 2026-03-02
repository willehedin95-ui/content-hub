import { createServerSupabase } from "./supabase";

export async function getCached<T>(key: string): Promise<T | null> {
  const db = createServerSupabase();
  const { data } = await db
    .from("pulse_cache")
    .select("data, expires_at")
    .eq("cache_key", key)
    .single();

  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) {
    db.from("pulse_cache").delete().eq("cache_key", key).then(() => {});
    return null;
  }
  return data.data as T;
}

export async function invalidateCache(key: string): Promise<void> {
  const db = createServerSupabase();
  await db.from("pulse_cache").delete().eq("cache_key", key);
}

export async function setCache(key: string, data: unknown, ttlMinutes: number): Promise<void> {
  const db = createServerSupabase();
  const expires_at = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  await db
    .from("pulse_cache")
    .upsert({ cache_key: key, data, expires_at }, { onConflict: "cache_key" });
}
