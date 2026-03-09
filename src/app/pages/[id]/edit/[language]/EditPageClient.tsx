"use client";

import BuilderShell from "@/components/builder/BuilderShell";
import { Translation, LANGUAGES } from "@/types";

interface Props {
  pageId: string;
  pageName: string;
  pageSlug: string;
  pageProduct?: string;
  originalHtml: string;
  translation: Translation;
  language: (typeof LANGUAGES)[number];
  variantLabel?: string;
  isSource?: boolean;
}

export default function EditPageClient(props: Props) {
  return <BuilderShell {...props} />;
}
