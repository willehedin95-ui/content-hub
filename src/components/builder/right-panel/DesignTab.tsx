"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import SpacingControl from "./controls/SpacingControl";
import SizeControl from "./controls/SizeControl";
import TypographyControl from "./controls/TypographyControl";
import BackgroundControl from "./controls/BackgroundControl";
import BorderControl from "./controls/BorderControl";
import EffectsControl from "./controls/EffectsControl";
import LayoutControl from "./controls/LayoutControl";

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export default function DesignTab() {
  return (
    <div>
      <Section title="Layout" defaultOpen={false}>
        <LayoutControl />
      </Section>
      <Section title="Size">
        <SizeControl />
      </Section>
      <Section title="Spacing">
        <SpacingControl />
      </Section>
      <Section title="Typography">
        <TypographyControl />
      </Section>
      <Section title="Background" defaultOpen={false}>
        <BackgroundControl />
      </Section>
      <Section title="Border" defaultOpen={false}>
        <BorderControl />
      </Section>
      <Section title="Effects" defaultOpen={false}>
        <EffectsControl />
      </Section>
    </div>
  );
}
