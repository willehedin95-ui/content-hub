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

  // Inject click-detector so clicking any text in the preview posts the text
  // to the parent window, which uses it to jump to the matching edit segment.
  const clickScript = `<script>
(function() {
  document.addEventListener('click', function(e) {
    var el = e.target;
    for (var i = 0; i < 5 && el && el !== document.body; i++) {
      var text = Array.from(el.childNodes)
        .filter(function(n) { return n.nodeType === 3; })
        .map(function(n) { return n.textContent.trim(); })
        .join(' ').trim();
      if (text.length > 3) {
        window.parent.postMessage({ type: 'cc-segment', text: text }, '*');
        return;
      }
      el = el.parentElement;
    }
  }, true);
})();
</script>`;

  const html = (translation.translated_html as string).replace(
    /<\/body>/i,
    clickScript + "</body>"
  );

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
