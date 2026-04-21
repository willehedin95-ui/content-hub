import { createServerSupabase } from "@/lib/supabase-admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BlogReviewListPage() {
  const db = createServerSupabase();
  const { data: rows } = await db
    .from("translations")
    .select(
      "id, slug, seo_title, publish_error, updated_at, pages!inner(workspace_id, blog_category, source_language)"
    )
    .eq("status", "pending_review")
    .order("updated_at", { ascending: false });

  const pending = rows ?? [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">Pending review</h1>
      <p className="text-sm text-gray-600 mb-8">
        Artiklar från autopilot som flaggats av soft-gaten och väntar på ditt beslut.
      </p>

      {pending.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-10 text-center text-gray-600">
          Inga artiklar i kö just nu.
        </div>
      )}

      <ul className="space-y-3">
        {pending.map((row) => {
          const reasons = (row.publish_error || "").replace(/^Soft gate:\s*/, "");
          return (
            <li
              key={row.id as string}
              className="rounded-lg border border-gray-200 bg-white p-4 hover:bg-gray-50"
            >
              <Link href={`/blog-review/${row.id}`} className="block">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium text-gray-900 truncate">
                      {row.seo_title || row.slug}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {row.slug} · {new Date(row.updated_at as string).toLocaleString("sv-SE")}
                    </p>
                    {reasons && (
                      <p className="text-sm text-amber-700 mt-2 break-words">
                        Flaggor: <code className="font-mono text-xs">{reasons}</code>
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-indigo-600 shrink-0">Öppna →</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
