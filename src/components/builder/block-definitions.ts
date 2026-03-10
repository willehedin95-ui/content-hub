import {
  Type,
  Image,
  Video,
  MousePointer,
  Minus,
  Square,
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
      el.textContent = "New text block";
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
