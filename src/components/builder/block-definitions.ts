import {
  Type,
  Image,
  Video,
  MousePointer,
  Minus,
  Square,
  MessageSquareQuote,
  HelpCircle,
  Columns2,
  LayoutTemplate,
} from "lucide-react";

export interface BlockDef {
  id: string;
  label: string;
  icon: typeof Type;
  insert: (doc: Document) => HTMLElement;
}

const PLACEHOLDER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23e5e7eb'%3E%3Crect width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-size='16' font-family='sans-serif'%3EImage%3C/text%3E%3C/svg%3E";

export const BLOCKS: BlockDef[] = [
  {
    id: "text",
    label: "Text",
    icon: Type,
    insert: (doc) => {
      const el = doc.createElement("p");
      el.setAttribute("contenteditable", "true");
      el.style.padding = "8px 0";
      el.textContent = "Type your text here...";
      el.style.color = "#9ca3af";
      el.style.fontStyle = "italic";
      el.setAttribute("data-cc-placeholder", "true");
      return el;
    },
  },
  {
    id: "image",
    label: "Image",
    icon: Image,
    insert: (doc) => {
      const el = doc.createElement("img");
      el.src = PLACEHOLDER_SVG;
      el.alt = "Placeholder image";
      el.style.width = "100%";
      el.style.maxWidth = "400px";
      el.style.display = "block";
      return el;
    },
  },
  {
    id: "video",
    label: "Video",
    icon: Video,
    insert: (doc) => {
      const el = doc.createElement("video");
      el.setAttribute("controls", "");
      el.style.width = "100%";
      el.style.maxWidth = "640px";
      el.style.display = "block";
      return el;
    },
  },
  {
    id: "cta",
    label: "CTA Button",
    icon: MousePointer,
    insert: (doc) => {
      const el = doc.createElement("a");
      el.href = "#";
      el.textContent = "Click Here";
      el.style.display = "inline-block";
      el.style.padding = "12px 24px";
      el.style.backgroundColor = "#4f46e5";
      el.style.color = "#ffffff";
      el.style.borderRadius = "6px";
      el.style.textDecoration = "none";
      el.style.fontWeight = "600";
      el.style.fontSize = "16px";
      return el;
    },
  },
  {
    id: "divider",
    label: "Divider",
    icon: Minus,
    insert: (doc) => {
      const el = doc.createElement("hr");
      el.style.margin = "16px 0";
      return el;
    },
  },
  {
    id: "container",
    label: "Container",
    icon: Square,
    insert: (doc) => {
      const el = doc.createElement("div");
      el.style.padding = "16px";
      el.style.minHeight = "80px";
      el.style.border = "2px dashed #d1d5db";
      return el;
    },
  },
];

export const BLOCKS_MAP: Record<string, BlockDef> = Object.fromEntries(
  BLOCKS.map((b) => [b.id, b])
);

// ---------------------------------------------------------------------------
// Section Templates — pre-built multi-element sections
// ---------------------------------------------------------------------------

export interface SectionTemplate {
  id: string;
  label: string;
  icon: typeof Type;
  html: string;
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    id: "testimonial",
    label: "Testimonial",
    icon: MessageSquareQuote,
    html: `<div style="padding:24px;background:#f9fafb;border-radius:8px;border-left:4px solid #6366f1;margin:16px 0"><p style="font-style:italic;color:#374151;font-size:16px;line-height:1.6;margin:0 0 12px 0">&ldquo;This product changed my life. I can&rsquo;t recommend it enough!&rdquo;</p><p style="font-weight:600;color:#6366f1;font-size:14px;margin:0">&mdash; Happy Customer</p></div>`,
  },
  {
    id: "faq-item",
    label: "FAQ Item",
    icon: HelpCircle,
    html: `<div style="padding:16px 0;border-bottom:1px solid #e5e7eb;margin:0"><p style="font-weight:600;color:#111827;font-size:16px;margin:0 0 8px 0">Frequently asked question?</p><p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0">Answer to the question goes here. Explain the details clearly and concisely.</p></div>`,
  },
  {
    id: "two-columns",
    label: "Two Columns",
    icon: Columns2,
    html: `<div style="display:flex;gap:24px;margin:16px 0"><div style="flex:1;padding:16px;background:#f9fafb;border-radius:8px"><p style="font-weight:600;color:#111827;margin:0 0 8px 0">Left Column</p><p style="color:#6b7280;font-size:14px;margin:0">Content for the left side.</p></div><div style="flex:1;padding:16px;background:#f9fafb;border-radius:8px"><p style="font-weight:600;color:#111827;margin:0 0 8px 0">Right Column</p><p style="color:#6b7280;font-size:14px;margin:0">Content for the right side.</p></div></div>`,
  },
  {
    id: "hero-section",
    label: "Hero Section",
    icon: LayoutTemplate,
    html: `<div style="text-align:center;padding:48px 24px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:8px;margin:16px 0"><h2 style="color:#ffffff;font-size:28px;font-weight:700;margin:0 0 12px 0">Your Headline Here</h2><p style="color:rgba(255,255,255,0.9);font-size:16px;max-width:480px;margin:0 auto 20px auto;line-height:1.6">A compelling subheadline that explains the value proposition.</p><a href="#" style="display:inline-block;padding:12px 32px;background:#ffffff;color:#667eea;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">Get Started</a></div>`,
  },
];
