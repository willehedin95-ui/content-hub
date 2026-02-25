"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2,
  Loader2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

interface ProductWithImages {
  id: string;
  slug: string;
  name: string;
}

interface Props {
  products: ProductWithImages[];
}

export default function SwiperClient({ products }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(
    products[0]?.id ?? ""
  );
  const [selectedAngle, setSelectedAngle] = useState("auto-detect");
  const [pageName, setPageName] = useState("");
  const [pageSlug, setPageSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  async function safeJson<T>(res: Response, fallbackMsg: string): Promise<T> {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || fallbackMsg);
      return data as T;
    } catch (err) {
      if (err instanceof SyntaxError) {
        if (res.status === 504) {
          throw new Error("The server timed out. Please try again.");
        }
        throw new Error(`Server error (${res.status}): ${text.slice(0, 150)}`);
      }
      throw err;
    }
  }

  async function handleSwipe() {
    if (!url.trim() || !selectedProductId) return;
    setError(null);
    setSubmitting(true);

    try {
      // Step 1: Fetch the competitor page
      const fetchRes = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const { html, title } = await safeJson<{ html: string; title: string }>(
        fetchRes,
        "Failed to fetch URL"
      );

      // Derive name/slug from title if not set
      const name = pageName.trim() || title || url.trim();
      const slug =
        pageSlug.trim() ||
        (title || url.trim())
          .toLowerCase()
          .replace(/https?:\/\/[^/]+\/?/, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) ||
        "import";

      // Step 2: Create swipe job + page
      const swipeRes = await fetch("/api/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          productId: selectedProductId,
          sourceUrl: url.trim(),
          sourceLanguage: "en",
          angle: selectedAngle,
          name,
          slug,
          pageType: "advertorial",
        }),
      });

      const { pageId } = await safeJson<{ jobId: string; pageId: string | null }>(
        swipeRes,
        "Failed to create swipe job"
      );

      // Redirect to page detail — ImportProgressPanel shows progress there
      if (pageId) {
        router.push(`/pages/${pageId}`);
      } else {
        throw new Error("Page was not created. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
          <Wand2 className="w-6 h-6 text-indigo-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Page Swiper</h1>
        <p className="text-sm text-gray-500 mt-2">
          Paste a competitor URL and we&apos;ll rewrite it for your product
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Competitor URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://competitor.com/their-page"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Product
          </label>
          {products.length === 0 ? (
            <p className="text-sm text-gray-400">
              No products yet.{" "}
              <button
                onClick={() => router.push("/products")}
                className="text-indigo-600 hover:text-indigo-800"
              >
                Create one first
              </button>
            </p>
          ) : (
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              disabled={submitting}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Advertising Angle
          </label>
          <select
            value={selectedAngle}
            onChange={(e) => setSelectedAngle(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            disabled={submitting}
          >
            <option value="auto-detect">Auto-detect (match source)</option>
            <option value="neck-pain">Neck Pain</option>
            <option value="snoring">Snoring</option>
            <option value="sleep-quality">Sleep Quality</option>
          </select>
        </div>

        {/* Optional: override name/slug before import */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Page Name (optional)
            </label>
            <input
              type="text"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder="Auto-detected from page title"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Slug (optional)
            </label>
            <input
              type="text"
              value={pageSlug}
              onChange={(e) =>
                setPageSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                )
              }
              placeholder="auto-generated"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              disabled={submitting}
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => { setError(null); handleSwipe(); }}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 mt-1 font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
            </div>
          </div>
        )}

        <button
          onClick={handleSwipe}
          disabled={!url.trim() || !selectedProductId || submitting}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching page...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              Swipe Page
            </>
          )}
        </button>

        {submitting && (
          <p className="text-xs text-gray-400 text-center">
            The page will be created immediately and you can track the rewrite progress from the page detail view.
          </p>
        )}
      </div>
    </div>
  );
}
