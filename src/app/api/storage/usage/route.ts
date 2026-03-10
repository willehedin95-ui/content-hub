import { NextResponse } from "next/server";

const SUPABASE_PROJECT_REF = "fbpefeqqqfrcmfmjmeij";
const STORAGE_LIMIT_GB = 100; // Supabase Pro plan

export async function GET() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "SUPABASE_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT
              bucket_id,
              count(*)::int as file_count,
              coalesce(sum((metadata->>'size')::bigint), 0) as bytes
            FROM storage.objects
            GROUP BY bucket_id
            ORDER BY bytes DESC
          `,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Failed to query storage", details: text },
        { status: 500 }
      );
    }

    const rows: { bucket_id: string; file_count: number; bytes: string }[] =
      await res.json();

    const buckets = rows.map((r) => ({
      name: r.bucket_id,
      bytes: Number(r.bytes),
      file_count: r.file_count,
    }));

    const totalBytes = buckets.reduce((sum, b) => sum + b.bytes, 0);

    return NextResponse.json({
      total_bytes: totalBytes,
      limit_bytes: STORAGE_LIMIT_GB * 1024 * 1024 * 1024,
      buckets,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to get storage usage" },
      { status: 500 }
    );
  }
}
