import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(_req.url);
  const origin = url.origin;
  const raw = url.searchParams.get("raw") === "true";
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

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
      .eq("workspace_id", workspaceId)
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
    'img:hover, video:hover { outline: 2px dashed rgba(245,158,11,0.6); outline-offset: 2px; cursor: pointer; }'
  ].join('\\n');
  document.head.appendChild(style);

  // Extract surrounding text for context-aware image generation
  function getSurroundingText(img) {
    var sectionTags = ['SECTION', 'ARTICLE', 'MAIN'];
    var sectionClasses = /section|block|container|wrapper|row|col/i;
    var el = img.parentElement;
    var container = null;
    var depth = 0;
    while (el && depth < 5) {
      if (sectionTags.indexOf(el.tagName) !== -1 || sectionClasses.test(el.className || '')) {
        container = el;
        break;
      }
      el = el.parentElement;
      depth++;
    }
    if (!container) {
      container = img.parentElement && img.parentElement.parentElement
        ? img.parentElement.parentElement : img.parentElement;
    }
    if (!container) return '';
    var textEls = container.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,span,td,th');
    var texts = [];
    var wordCount = 0;
    for (var i = 0; i < textEls.length; i++) {
      var t = (textEls[i].textContent || '').trim();
      if (!t) continue;
      var words = t.split(/\\s+/).length;
      if (wordCount + words > 500) break;
      texts.push(t);
      wordCount += words;
    }
    return texts.join(' \\n ');
  }

  // Send image/video metadata to parent (non-blocking — normal selection still fires)
  document.addEventListener('click', function(e) {
    var img = e.target.closest('img');
    if (img && img.src) {
      e.preventDefault();
      var allImgs = Array.from(document.querySelectorAll('img'));
      window.parent.postMessage({
        type: 'cc-image-click',
        src: img.src,
        index: allImgs.indexOf(img),
        width: img.naturalWidth || img.offsetWidth || 200,
        height: img.naturalHeight || img.offsetHeight || 200,
        surroundingText: getSurroundingText(img)
      }, ORIGIN);
      return;
    }

    var video = e.target.closest('video');
    if (video) {
      e.preventDefault();
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

  // Raw mode: serve the HTML as-is for clean preview in a new tab (with JS running)
  if (raw) {
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "sandbox allow-same-origin",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  }

  // Editor mode: inject contentEditable script for builder iframe
  const finalHtml = html.replace(/<\/body>/i, editorScript + "</body>");

  return new NextResponse(finalHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
