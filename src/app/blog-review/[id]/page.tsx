import { createServerSupabase } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import ReviewActions from "./ReviewActions";

export const dynamic = "force-dynamic";

export default async function BlogReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();
  const { data: trans } = await db
    .from("translations")
    .select(
      "id, slug, seo_title, seo_description, translated_html, publish_error, status, pages!inner(blog_category, workspace_id, source_language)"
    )
    .eq("id", id)
    .single();

  if (!trans) notFound();

  const page = trans.pages as unknown as {
    blog_category: string | null;
    source_language: string;
  };
  const reasons = (trans.publish_error || "").replace(/^Soft gate:\s*/, "");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <a href="/blog-review" className="text-sm text-gray-600 hover:text-gray-900">
          ← Alla pending
        </a>
      </div>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">
              {trans.seo_title || trans.slug}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {trans.slug} · {page.blog_category || "—"} · {page.source_language}
            </p>
            {trans.seo_description && (
              <p className="text-sm text-gray-700 mt-3 italic">{trans.seo_description}</p>
            )}
          </div>
          <ReviewActions
            translationId={trans.id as string}
            currentStatus={trans.status as string}
          />
        </div>

        {reasons && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-800 mb-1">
              Soft gate-flaggor
            </p>
            <code className="text-sm text-amber-900 font-mono">{reasons}</code>
          </div>
        )}
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-4 overflow-x-auto">
        <iframe
          srcDoc={trans.translated_html as string}
          className="w-full"
          style={{ height: "70vh", border: 0 }}
          sandbox="allow-same-origin"
        />
      </section>
    </main>
  );
}
