"use client";
import { useQuiz } from "./QuizContext";
import { topoOrderSteps } from "@/lib/quiz-graph";
import type { QuizSettings } from "@/types/quiz";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Shared style atoms
// ---------------------------------------------------------------------------

const inputBase =
  "w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 placeholder:text-gray-400";

const labelBase = "block text-xs font-medium text-gray-500 mb-1";

const textareaBase =
  "w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 placeholder:text-gray-400 resize-y";

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {open ? (
          <ChevronDown size={16} className="text-gray-400" />
        ) : (
          <ChevronRight size={16} className="text-gray-400" />
        )}
      </button>
      {open && <div className="px-4 py-4 flex flex-col gap-3 bg-white">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------

export function SettingsPanel() {
  const { settings, setSettings, data } = useQuiz();

  // Helper: patch top-level settings key(s) immutably
  function patch(update: Partial<QuizSettings>) {
    setSettings((prev) => ({ ...prev, ...update }));
  }

  // Get ordered steps for Klaviyo capture dropdown
  const orderedSteps = topoOrderSteps(data);

  return (
    <div className="flex-1 overflow-y-auto p-4 min-h-0 flex flex-col gap-4">
      {/* 1. Branding */}
      <Section title="Branding">
        {/* Brand Logo */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelBase}>Brand Logo URL</label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.brandLogo?.enabled ?? false}
                onChange={(e) =>
                  patch({
                    brandLogo: {
                      url: settings.brandLogo?.url ?? "",
                      enabled: e.target.checked,
                    },
                  })
                }
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
              />
              <span className="text-xs text-gray-500">Show logo</span>
            </label>
          </div>
          <input
            type="text"
            value={settings.brandLogo?.url ?? ""}
            onChange={(e) =>
              patch({
                brandLogo: {
                  url: e.target.value,
                  enabled: settings.brandLogo?.enabled ?? false,
                },
              })
            }
            placeholder="https://example.com/logo.png"
            className={inputBase}
          />
        </div>

        {/* Google Font */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelBase}>Font Family</label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.fontSettings.enabled}
                onChange={(e) =>
                  patch({
                    fontSettings: { ...settings.fontSettings, enabled: e.target.checked },
                  })
                }
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
              />
              <span className="text-xs text-gray-500">Custom font</span>
            </label>
          </div>
          <input
            type="text"
            value={settings.fontSettings.fontFamily}
            onChange={(e) =>
              patch({
                fontSettings: { ...settings.fontSettings, fontFamily: e.target.value },
              })
            }
            placeholder="Inter"
            className={inputBase}
          />
          <p className="text-xs text-gray-400 mt-1">
            Google Fonts family name (e.g. &quot;Inter&quot;, &quot;Poppins&quot;, &quot;Lato&quot;)
          </p>
        </div>

        {/* Colors */}
        <div>
          <label className={labelBase}>Brand Colors</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["background", "Background"],
                ["textPrimary", "Text Primary"],
                ["textSecondary", "Text Secondary"],
                ["primaryBrand", "Primary Brand"],
                ["optionBackground", "Option Background"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="color"
                  value={settings.brandColors[key]}
                  onChange={(e) =>
                    patch({
                      brandColors: { ...settings.brandColors, [key]: e.target.value },
                    })
                  }
                  className="w-8 h-8 rounded border border-gray-200 p-0.5 cursor-pointer bg-white"
                />
                <span className="text-xs text-gray-600">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* 2. Display */}
      <Section title="Display">
        {(
          [
            ["progressBar", "Show progress bar"],
            ["stepProgressCount", "Show step count (e.g. 2 / 5)"],
            ["backNavigation", "Allow back navigation"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={(e) => patch({ [key]: e.target.checked })}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
            />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </Section>

      {/* 3. Metadata (SEO / OG) */}
      <Section title="Metadata (SEO / OG)">
        <div>
          <label className={labelBase}>Page Title</label>
          <input
            type="text"
            value={settings.metadata.title}
            onChange={(e) =>
              patch({ metadata: { ...settings.metadata, title: e.target.value } })
            }
            placeholder="My Quiz"
            className={inputBase}
          />
        </div>
        <div>
          <label className={labelBase}>Meta Description</label>
          <textarea
            value={settings.metadata.description}
            onChange={(e) =>
              patch({ metadata: { ...settings.metadata, description: e.target.value } })
            }
            placeholder="Short description shown in search results"
            rows={3}
            className={textareaBase}
          />
        </div>
        <div>
          <label className={labelBase}>OG Image URL</label>
          <input
            type="text"
            value={settings.metadata.ogImage ?? ""}
            onChange={(e) =>
              patch({
                metadata: { ...settings.metadata, ogImage: e.target.value || undefined },
              })
            }
            placeholder="https://example.com/og.jpg"
            className={inputBase}
          />
        </div>
        <div>
          <label className={labelBase}>Favicon URL</label>
          <input
            type="text"
            value={settings.metadata.favicon ?? ""}
            onChange={(e) =>
              patch({
                metadata: { ...settings.metadata, favicon: e.target.value || undefined },
              })
            }
            placeholder="https://example.com/favicon.ico"
            className={inputBase}
          />
        </div>
      </Section>

      {/* 4. Providers */}
      <Section title="Providers" defaultOpen={false}>
        {/* Klaviyo */}
        <div>
          <label className={labelBase}>Klaviyo List ID</label>
          <input
            type="text"
            value={settings.providers.klaviyo?.listId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              patch({
                providers: {
                  ...settings.providers,
                  klaviyo: val
                    ? {
                        listId: val,
                        captureAtStepId: settings.providers.klaviyo?.captureAtStepId,
                      }
                    : undefined,
                },
              });
            }}
            placeholder="AbCdEf"
            className={inputBase}
          />
        </div>
        <div>
          <label className={labelBase}>Klaviyo Capture Step</label>
          <select
            value={settings.providers.klaviyo?.captureAtStepId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              patch({
                providers: {
                  ...settings.providers,
                  klaviyo: settings.providers.klaviyo
                    ? {
                        ...settings.providers.klaviyo,
                        captureAtStepId: val || undefined,
                      }
                    : undefined,
                },
              });
            }}
            className={inputBase}
          >
            <option value="">No email capture</option>
            {orderedSteps.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Which step triggers the email input field at runtime
          </p>
        </div>

        {/* Meta Pixel */}
        <div>
          <label className={labelBase}>Meta Pixel ID</label>
          <input
            type="text"
            value={settings.providers.metaPixel?.pixelId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              patch({
                providers: {
                  ...settings.providers,
                  metaPixel: val ? { pixelId: val } : undefined,
                },
              });
            }}
            placeholder="123456789012345"
            className={inputBase}
          />
        </div>

        {/* GA4 */}
        <div>
          <label className={labelBase}>GA4 Measurement ID</label>
          <input
            type="text"
            value={settings.providers.ga4?.measurementId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              patch({
                providers: {
                  ...settings.providers,
                  ga4: val ? { measurementId: val } : undefined,
                },
              });
            }}
            placeholder="G-XXXXXXXXXX"
            className={inputBase}
          />
        </div>
      </Section>

      {/* 5. Redirect URL */}
      <Section title="Redirect URL (exit)">
        <div>
          <label className={labelBase}>Default Exit URL</label>
          <input
            type="text"
            value={settings.redirectUrl}
            onChange={(e) => patch({ redirectUrl: e.target.value })}
            placeholder="https://get-renew.com/products/hydro13"
            className={inputBase}
          />
          <p className="text-xs text-gray-400 mt-1">
            Used when an exit node has no specific URL. Usually the product URL from
            market_product_urls (e.g. https://get-renew.com/products/hydro13 for Hydro13).
          </p>
        </div>
      </Section>

      {/* 6. Custom Code */}
      <Section title="Custom Code" defaultOpen={false}>
        <div>
          <label className={labelBase}>Head (before &lt;/head&gt;)</label>
          <textarea
            value={settings.customCode?.head ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              patch({
                customCode: {
                  head: val || undefined,
                  bodyEnd: settings.customCode?.bodyEnd,
                },
              });
            }}
            placeholder="<!-- scripts, styles, or other tags -->"
            rows={4}
            spellCheck={false}
            className={`${textareaBase} font-mono text-xs`}
          />
        </div>
        <div>
          <label className={labelBase}>Body End (before &lt;/body&gt;)</label>
          <textarea
            value={settings.customCode?.bodyEnd ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              patch({
                customCode: {
                  head: settings.customCode?.head,
                  bodyEnd: val || undefined,
                },
              });
            }}
            placeholder="<!-- scripts appended at end of body -->"
            rows={4}
            spellCheck={false}
            className={`${textareaBase} font-mono text-xs`}
          />
        </div>
      </Section>
    </div>
  );
}
