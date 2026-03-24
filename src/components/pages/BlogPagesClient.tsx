"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ExternalLink, Globe, FileText, ChevronDown, LayoutTemplate } from "lucide-react";
import type { Page, Translation, Language, LANGUAGES as LangType } from "@/types";
import { BLOG_TEMPLATES } from "@/lib/blog-templates";
import BlogAnalytics from "./BlogAnalytics";

const LANGUAGES: { value: Language; label: string; flag: string }[] = [
  { value: "sv", label: "Swedish", flag: "🇸🇪" },
  { value: "da", label: "Danish", flag: "🇩🇰" },
  { value: "no", label: "Norwegian", flag: "🇳🇴" },
];

interface Props {
  pages: (Page & { translations?: Pick<Translation, "id" | "language" | "status" | "published_url" | "seo_title">[] })[];
}

export default function BlogPagesClient({ pages }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(BLOG_TEMPLATES[0].id);
  const [showTemplates, setShowTemplates] = useState(false);

  const createBlogPage = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          content_type: "seo_blog",
          page_type: "listicle",
          template_id: selectedTemplate,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/pages/${data.id}/edit/sv/`);
      }
    } finally {
      setCreating(false);
      setNewName("");
    }
  };

  const activeTemplate = BLOG_TEMPLATES.find((t) => t.id === selectedTemplate) ?? BLOG_TEMPLATES[0];

  // Compute stats
  const totalArticles = pages.length;
  const publishedPerLang = LANGUAGES.map((lang) => ({
    ...lang,
    published: pages.filter((p) =>
      p.translations?.some((t) => t.language === lang.value && t.status === "published")
    ).length,
  }));

  return (
    <div>
      {/* Stats bar */}
      {totalArticles > 0 && (
        <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
          <span>{totalArticles} article{totalArticles !== 1 ? "s" : ""}</span>
          <span className="text-gray-300">|</span>
          {publishedPerLang.map((lang) => (
            <span key={lang.value} className="flex items-center gap-1">
              {lang.flag} {lang.published} published
            </span>
          ))}
        </div>
      )}

      {/* Analytics dashboard */}
      <BlogAnalytics />

      {/* Create new blog article */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New blog article name..."
            className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={(e) => e.key === "Enter" && createBlogPage()}
          />
          <button
            onClick={createBlogPage}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </div>

        {/* Template selector */}
        <div>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            Template: <span className="font-medium text-gray-700">{activeTemplate.name}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showTemplates ? "rotate-180" : ""}`} />
          </button>

          {showTemplates && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {BLOG_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTemplate(t.id); setShowTemplates(false); }}
                  className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                    selectedTemplate === t.id
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                  <span className="inline-block text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mt-1.5">
                    {t.category}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Blog pages list */}
      {pages.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No blog articles yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => (
            <div
              key={page.id}
              className="border rounded-lg p-4 hover:border-gray-300 transition-colors cursor-pointer"
              onClick={() => router.push(`/pages/${page.id}/edit/sv/`)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-sm">{page.name}</h3>
                  {page.blog_category && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
                      {page.blog_category}
                    </span>
                  )}
                  <p className="text-xs text-gray-400 mt-1">/{page.slug}</p>
                </div>
                <div className="flex items-center gap-1">
                  {LANGUAGES.map((lang) => {
                    const t = page.translations?.find((tr) => tr.language === lang.value);
                    if (!t) return null;
                    const isPublished = t.status === "published";
                    return (
                      <span
                        key={lang.value}
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          isPublished
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                        title={`${lang.label}: ${t.status}`}
                      >
                        {lang.flag}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Published URLs */}
              <div className="flex flex-wrap gap-2 mt-2">
                {page.translations
                  ?.filter((t) => t.status === "published" && t.published_url)
                  .map((t) => (
                    <a
                      key={t.id}
                      href={t.published_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Globe className="w-3 h-3" />
                      {t.published_url!.replace(/^https?:\/\//, "")}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
