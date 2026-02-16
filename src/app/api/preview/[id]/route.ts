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

  // Prevent link navigation
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (link) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Prevent form submissions
  document.addEventListener('submit', function(e) { e.preventDefault(); }, true);

  // Editor styles
  var style = document.createElement('style');
  style.setAttribute('data-cc-editor', 'true');
  style.textContent = [
    '[data-cc-editable]:hover { outline: 2px dashed rgba(99,102,241,0.5); outline-offset: 2px; cursor: text; }',
    '[data-cc-editable][contenteditable="true"] { outline: 2px solid rgba(99,102,241,0.8); outline-offset: 2px; }',
    '[data-cc-editable]:focus { outline: 2px solid rgba(99,102,241,1); outline-offset: 2px; }'
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

  // Enable contentEditable on click
  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-cc-editable]');
    if (el && el.contentEditable !== 'true') {
      el.contentEditable = 'true';
      el.focus();
    }
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
