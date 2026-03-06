import Link from "next/link";
import { Plus, Video, Clock } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase";
import { VideoJob } from "@/types";
import { PRODUCTS } from "@/types";
import { VIDEO_FORMATS, HOOK_TYPES } from "@/lib/constants";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  generating: "bg-yellow-100 text-yellow-700",
  generated: "bg-blue-100 text-blue-700",
  translating: "bg-purple-100 text-purple-700",
  translated: "bg-green-100 text-green-700",
  pushing: "bg-orange-100 text-orange-700",
  live: "bg-emerald-100 text-emerald-700",
  killed: "bg-red-100 text-red-700",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toLowerCase();
}

function getFormatLabel(formatType: string | null): string | null {
  if (!formatType) return null;
  return VIDEO_FORMATS.find((f) => f.id === formatType)?.label ?? formatType;
}

function getHookLabel(hookType: string | null): string | null {
  if (!hookType) return null;
  return HOOK_TYPES.find((h) => h.id === hookType)?.label ?? hookType;
}

function getProductLabel(product: string): string {
  return PRODUCTS.find((p) => p.value === product)?.label ?? product;
}

export default async function VideoAdsPage() {
  const supabase = createServerSupabase();

  const { data: jobs, error } = await supabase
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*), video_shots(*)")
    .order("created_at", { ascending: false });

  const videoJobs: VideoJob[] = error ? [] : (jobs ?? []);

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Video Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI UGC video concepts generated with Sora 2 Pro
          </p>
        </div>
        <Link
          href="/brainstorm"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Video Concept
        </Link>
      </div>

      {/* Content */}
      {videoJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Video className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No video concepts yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Click &quot;+ New Video Concept&quot; to create your first video ad
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {videoJobs.map((job) => {
            const completedTranslations = (job.video_translations ?? []).filter(
              (t) => t.status === "completed"
            ).length;
            const totalTranslations = (job.video_translations ?? []).length;
            const thumbnail = job.source_videos?.[0]?.thumbnail_url;
            const conceptNum = job.concept_number;
            const statusColor = STATUS_COLORS[job.status] ?? STATUS_COLORS.draft;

            return (
              <Link
                key={job.id}
                href={`/video-ads/${job.id}`}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-gray-100 relative overflow-hidden">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={job.concept_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-8 h-8 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="p-4">
                  {/* Badges row */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {getProductLabel(job.product)}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}
                    >
                      {job.status}
                    </span>
                    {job.video_shots?.length ? (
                      <span className="bg-orange-50 text-orange-700 text-xs px-2 py-0.5 rounded">
                        {job.video_shots.length} shots
                      </span>
                    ) : null}
                    {job.video_generation_method === "storyboard" && (
                      <span className="bg-cyan-50 text-cyan-700 text-xs px-2 py-0.5 rounded">
                        Storyboard{job.storyboard_duration ? ` ${job.storyboard_duration}s` : ""}
                      </span>
                    )}
                    {job.video_generation_method === "kling" && (
                      <span className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded">
                        Kling 3.0
                      </span>
                    )}
                    {job.video_generation_method === "veo3" && job.video_shots?.length ? (
                      <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded">
                        Veo 3.1
                      </span>
                    ) : null}
                  </div>

                  {/* Concept name */}
                  <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                    {conceptNum != null && (
                      <span className="text-gray-400 font-mono mr-1.5">
                        #{String(conceptNum).padStart(3, "0")}
                      </span>
                    )}
                    {job.concept_name}
                  </h3>

                  {/* Format & Hook pills */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {getFormatLabel(job.format_type) && (
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {getFormatLabel(job.format_type)}
                      </span>
                    )}
                    {getHookLabel(job.hook_type) && (
                      <span className="text-[11px] text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                        {getHookLabel(job.hook_type)}
                      </span>
                    )}
                  </div>

                  {/* Footer: translation progress + date */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      {totalTranslations > 0 ? (
                        <>
                          <span
                            className={
                              completedTranslations === totalTranslations
                                ? "text-emerald-600 font-medium"
                                : ""
                            }
                          >
                            {completedTranslations}/{totalTranslations}
                          </span>
                          <span>translations</span>
                        </>
                      ) : (
                        <span>No translations</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {formatDate(job.created_at)}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
