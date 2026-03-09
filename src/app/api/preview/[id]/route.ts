import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const origin = new URL(_req.url).origin;
  const db = createServerSupabase();

  // Handle source preview: synthetic ID format "source_<pageId>"
  const isSourcePreview = id.startsWith("source_");
  const realId = isSourcePreview ? id.slice("source_".length) : id;

  if (!isValidUUID(realId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  let html: string;

  if (isSourcePreview) {
    const { data: page, error } = await db
      .from("pages")
      .select("original_html, source_url")
      .eq("id", realId)
      .single();

    if (error || !page?.original_html) {
      return new NextResponse("Not found", { status: 404 });
    }
    html = page.original_html;
  } else {
    const { data: translation, error } = await db
      .from("translations")
      .select(`translated_html, pages (source_url)`)
      .eq("id", id)
      .single();

    if (error || !translation?.translated_html) {
      return new NextResponse("Not found", { status: 404 });
    }
    html = translation.translated_html as string;
  }

  // Inject contentEditable editing script so users can click and edit text inline
  const editorScript = `<script data-cc-injected="true">
(function() {
  var ORIGIN = ${JSON.stringify(origin)};
  var SKIP = ['SCRIPT','STYLE','NOSCRIPT','SVG','PATH','IFRAME','VIDEO','AUDIO','CANVAS','INPUT','SELECT','TEXTAREA','OPTION'];
  var activeEl = null;

  // Prevent link navigation
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (link) { e.preventDefault(); }
  }, true);

  // Prevent form submissions
  document.addEventListener('submit', function(e) { e.preventDefault(); }, true);

  // Editor styles
  var style = document.createElement('style');
  style.setAttribute('data-cc-editor', 'true');
  style.textContent = [
    '[data-cc-selected] { outline: 2px solid rgba(99,102,241,0.8) !important; outline-offset: 2px; }',
    'img:not([data-cc-img-highlight]):hover { outline: 2px dashed rgba(245,158,11,0.6); outline-offset: 2px; cursor: pointer; }',
    'img[data-cc-img-highlight] { outline: 3px solid #818cf8; outline-offset: 2px; }',
    'video:not([data-cc-media-highlight]):hover { outline: 2px dashed rgba(245,158,11,0.6); outline-offset: 2px; cursor: pointer; }',
    'video[data-cc-media-highlight] { outline: 3px solid #818cf8; outline-offset: 2px; }'
  ].join('\\n');
  document.head.appendChild(style);

  // Handle clicks: image/video selection only (text editing handled via right panel)
  document.addEventListener('click', function(e) {
    // Image click — send to parent for image panel
    var img = e.target.closest('img');
    if (img && img.src && !img.src.startsWith('data:')) {
      e.preventDefault();
      e.stopPropagation();
      var allImgs = Array.from(document.querySelectorAll('img'));
      window.parent.postMessage({
        type: 'cc-image-click',
        src: img.src,
        index: allImgs.indexOf(img),
        width: img.naturalWidth || img.offsetWidth || 200,
        height: img.naturalHeight || img.offsetHeight || 200
      }, ORIGIN);
      return;
    }

    // Video click — send to parent for replacement
    var video = e.target.closest('video');
    if (video) {
      e.preventDefault();
      e.stopPropagation();
      var allVideos = Array.from(document.querySelectorAll('video'));
      var videoSrc = video.src || (video.querySelector('source') || {}).src || '';
      window.parent.postMessage({
        type: 'cc-video-click',
        src: videoSrc,
        index: allVideos.indexOf(video),
        width: video.videoWidth || video.offsetWidth || 400,
        height: video.videoHeight || video.offsetHeight || 300
      }, ORIGIN);
      return;
    }
  });
})();
</script>`;

  // HTML was already sanitized when saved — no need to re-sanitize for preview
  const finalHtml = html.replace(/<\/body>/i, editorScript + "</body>");

  return new NextResponse(finalHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
