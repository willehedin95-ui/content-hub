import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: translation, error } = await db
    .from("translations")
    .select(`translated_html, pages (source_url)`)
    .eq("id", id)
    .single();

  if (error || !translation?.translated_html) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Inject contentEditable editing script so users can click and edit text inline
  const editorScript = `<script data-cc-injected="true">
(function() {
  var SKIP = ['SCRIPT','STYLE','NOSCRIPT','SVG','PATH','IFRAME','VIDEO','AUDIO','CANVAS','INPUT','SELECT','TEXTAREA','OPTION'];
  var activeEl = null;

  // Prevent link navigation (but allow image clicks through)
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (link) {
      e.preventDefault();
      if (!e.target.closest('img')) { e.stopPropagation(); }
    }
  }, true);

  // Prevent form submissions
  document.addEventListener('submit', function(e) { e.preventDefault(); }, true);

  // Editor styles
  var style = document.createElement('style');
  style.setAttribute('data-cc-editor', 'true');
  style.textContent = [
    '[data-cc-editable]:hover { outline: 2px dashed rgba(99,102,241,0.5); outline-offset: 2px; cursor: text; }',
    '[data-cc-editable][contenteditable="true"] { outline: 2px solid rgba(99,102,241,0.8); outline-offset: 2px; }',
    'img:not([data-cc-img-highlight]):hover { outline: 2px dashed rgba(245,158,11,0.6); outline-offset: 2px; cursor: pointer; }',
    'img[data-cc-img-highlight] { outline: 3px solid #818cf8; outline-offset: 2px; }'
  ].join('\\n');
  document.head.appendChild(style);

  // Mark text-containing elements as editable
  document.querySelectorAll('body *').forEach(function(el) {
    if (SKIP.indexOf(el.tagName) !== -1) return;
    var hasText = Array.from(el.childNodes).some(function(n) {
      return n.nodeType === 3 && n.textContent.trim().length > 0;
    });
    if (hasText) el.setAttribute('data-cc-editable', '');
  });

  // Deactivate current editable element
  function deactivate() {
    if (activeEl) {
      activeEl.contentEditable = 'false';
      activeEl.removeAttribute('contenteditable');
      activeEl = null;
    }
  }

  // Handle clicks: text editing, image selection, and deactivation
  document.addEventListener('click', function(e) {
    // Image click — send to parent for translation
    var img = e.target.closest('img');
    if (img && img.src && !img.src.startsWith('data:')) {
      e.preventDefault();
      e.stopPropagation();
      deactivate();
      var allImgs = Array.from(document.querySelectorAll('img'));
      window.parent.postMessage({
        type: 'cc-image-click',
        src: img.src,
        index: allImgs.indexOf(img),
        width: img.naturalWidth || img.offsetWidth || 200,
        height: img.naturalHeight || img.offsetHeight || 200
      }, '*');
      return;
    }

    // Text element click — enable editing
    var el = e.target.closest('[data-cc-editable]');
    if (el) {
      if (activeEl && activeEl !== el) deactivate();
      if (el.contentEditable !== 'true') {
        el.contentEditable = 'true';
        activeEl = el;
        el.focus();
      }
      return;
    }

    // Clicked on nothing editable — deactivate
    deactivate();
  });

  // Track dirty state
  var dirty = false;
  document.addEventListener('input', function() {
    if (!dirty) {
      dirty = true;
      window.parent.postMessage({ type: 'cc-dirty' }, '*');
    }
  });

  // Strip rich formatting on paste
  document.addEventListener('paste', function(e) {
    e.preventDefault();
    var text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, true);
})();
</script>`;

  const html = (translation.translated_html as string).replace(
    /<\/body>/i,
    editorScript + "</body>"
  );

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
