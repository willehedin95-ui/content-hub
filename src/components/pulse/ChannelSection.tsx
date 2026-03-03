// src/components/pulse/ChannelSection.tsx

"use client";

interface ChannelSectionProps {
  name: string;
  logo: React.ReactNode;
  children: React.ReactNode;
  unconfigured?: boolean;
}

export default function ChannelSection({ name, logo, children, unconfigured }: ChannelSectionProps) {
  return (
    <div className="mt-8">
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-6 h-6 flex items-center justify-center shrink-0">{logo}</div>
        <h2 className="text-base font-semibold text-gray-900">{name}</h2>
        {unconfigured && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Not connected</span>
        )}
      </div>
      {/* Metric cards grid */}
      {unconfigured ? (
        <p className="text-sm text-gray-400 ml-9">
          Connect {name} in Settings to see metrics here.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
