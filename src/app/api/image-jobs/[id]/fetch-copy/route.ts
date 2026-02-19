import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const db = createServerSupabase();

  // Load the concept
  const { data: job, error } = await db
    .from("image_jobs")
    .select("id, name, concept_number, ad_copy_doc_id")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  const docId = job.ad_copy_doc_id || process.env.AD_COPY_DOC_ID;
  if (!docId) {
    return NextResponse.json(
      { error: "No Google Doc configured. Set AD_COPY_DOC_ID in env or on the concept." },
      { status: 400 }
    );
  }

  // Auth with service account
  const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    return NextResponse.json(
      { error: "Google service account not configured" },
      { status: 500 }
    );
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents.readonly",
    ],
  });

  const docs = google.docs({ version: "v1", auth });

  try {
    const res = await docs.documents.get({
      documentId: docId,
      includeTabsContent: true,
    });

    const doc = res.data;
    const tabs = doc.tabs ?? [];

    // Check if a specific tab was requested
    const tabIdParam = _req.nextUrl.searchParams.get("tab_id");

    let matchedTab = null;

    if (tabIdParam) {
      // User explicitly picked a tab
      matchedTab = tabs.find((t) => t.tabProperties?.tabId === tabIdParam) ?? null;
    } else {
      // Try to find matching tab by concept number or name
      // Extract number from concept_number field, or from name (e.g., "#018 - Unaware" → "018")
      let conceptNumber = job.concept_number
        ? String(job.concept_number).padStart(3, "0")
        : null;
      if (!conceptNumber) {
        const nameNumMatch = job.name.match(/^#?(\d+)/);
        if (nameNumMatch) {
          conceptNumber = nameNumMatch[1].padStart(3, "0");
        }
      }

      // Extract core name keywords (strip number prefix, #, common suffixes like "ads")
      const coreName = job.name
        .replace(/^#?\d+\s*[-–—]\s*/, "") // strip "#018 - " prefix
        .toLowerCase()
        .trim();

      for (const tab of tabs) {
        const title = (tab.tabProperties?.title ?? "").trim();
        const titleLower = title.toLowerCase();

        // Match by concept number prefix (e.g., "015 - Partner Snoring" matches concept #15)
        if (conceptNumber) {
          const numMatch = title.match(/^(\d+)/);
          if (numMatch) {
            const tabNum = numMatch[1].padStart(3, "0");
            if (tabNum === conceptNumber) {
              matchedTab = tab;
              break;
            }
          }
        }

        // Match by core name (strip number prefix and common suffixes from both sides)
        const coreTabName = titleLower
          .replace(/^\d+\s*[-–—]\s*/, "") // strip "018 - " prefix
          .replace(/\s+(ads?|statics?|images?|copy)\s*$/i, "") // strip common suffixes
          .trim();

        if (coreName && coreTabName && (coreTabName.includes(coreName) || coreName.includes(coreTabName))) {
          matchedTab = tab;
          break;
        }
      }
    }

    // Build available tabs list (always returned for manual selection)
    const availableTabs = tabs
      .map((t) => ({
        id: t.tabProperties?.tabId,
        title: t.tabProperties?.title ?? "Untitled",
      }))
      .filter((t) => t.title !== "statics" && t.title !== "ad copy - english");

    // If no match found, return available tabs for the user
    if (!matchedTab) {
      return NextResponse.json({
        error: "no_match",
        message: `No tab matched concept "${job.name}"${job.concept_number ? ` (#${String(job.concept_number).padStart(3, "0")})` : ""}. Select a tab:`,
        availableTabs,
      }, { status: 404 });
    }

    // Extract text content from the matched tab
    const body = matchedTab.documentTab?.body;
    if (!body?.content) {
      return NextResponse.json({ error: "Tab has no content" }, { status: 400 });
    }

    const fullText = body.content
      .map((el) => {
        if (el.paragraph) {
          return (el.paragraph.elements ?? [])
            .map((e) => e.textRun?.content ?? "")
            .join("");
        }
        return "";
      })
      .join("");

    // Parse the content into primary texts and headlines
    const { primaryTexts, headlines } = parseAdCopy(fullText);

    return NextResponse.json({
      primaryTexts,
      headlines,
      matchedTab: matchedTab.tabProperties?.title,
      availableTabs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch doc";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Parse ad copy text from a Google Doc tab into primary texts and headlines.
 *
 * The doc format varies but generally:
 * - Multiple ads separated by "Ad 1:", "Ad 2:", etc.
 * - Headlines section marked with "Headlines:", "HEADLINES:", "Headline:"
 * - Swedish/other translations come after "SWEDISH:" or similar — we ignore those
 */
function parseAdCopy(text: string): {
  primaryTexts: string[];
  headlines: string[];
} {
  // Strip everything after language translation markers
  const langCutoff = text.search(
    /\n\s*(SWEDISH|DANISH|NORWEGIAN|GERMAN|NORSK|DANSK|SVENSK)[\s:]/i
  );
  const englishText = langCutoff > 0 ? text.substring(0, langCutoff) : text;

  // Split into ad sections
  const adSections = splitAdSections(englishText);

  const primaryTexts: string[] = [];
  const headlines: string[] = [];

  for (const section of adSections) {
    const { primary, sectionHeadlines } = extractFromSection(section);
    if (primary.trim()) {
      primaryTexts.push(primary.trim());
    }
    for (const h of sectionHeadlines) {
      if (h.trim() && !headlines.includes(h.trim())) {
        headlines.push(h.trim());
      }
    }
  }

  return {
    primaryTexts: primaryTexts.slice(0, 5),
    headlines: headlines.slice(0, 5),
  };
}

/**
 * Split text into ad sections. If explicit "Ad 1:", "Ad 2:" markers exist,
 * use those. Otherwise treat the whole text as one section.
 */
function splitAdSections(text: string): string[] {
  // Check for "Ad 1:", "Ad 2:", etc.
  const adPattern = /\n\s*Ad\s+\d+\s*[:\n]/gi;
  const matches = [...text.matchAll(adPattern)];

  if (matches.length >= 2) {
    const sections: string[] = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index! + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
      sections.push(text.substring(start, end));
    }
    return sections;
  }

  // Single section — just return the whole text
  return [text];
}

/**
 * Extract primary text and headlines from a single ad section.
 */
function extractFromSection(section: string): {
  primary: string;
  sectionHeadlines: string[];
} {
  // Find headlines marker
  const headlineMatch = section.match(
    /\n\s*(HEADLINES?|Headlines?)\s*:?\s*\n/i
  );

  let primaryPart: string;
  let headlinePart: string;

  if (headlineMatch) {
    const idx = headlineMatch.index!;
    primaryPart = section.substring(0, idx);
    headlinePart = section.substring(idx + headlineMatch[0].length);
  } else {
    primaryPart = section;
    headlinePart = "";
  }

  // Clean up primary text — remove leading "Ad N:" labels and trim
  const primary = primaryPart
    .replace(/^\s*Ad\s+\d+\s*:?\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Parse headlines — one per non-empty line
  const sectionHeadlines = headlinePart
    .split("\n")
    .map((line) => line.replace(/^[\s•\-\d.]+/, "").trim())
    .filter((line) => line.length > 0 && line.length < 200);

  return { primary, sectionHeadlines };
}
