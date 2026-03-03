// src/components/pulse/ChannelLogos.tsx — Inline SVG logos for dashboard channel sections

export function MetaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Meta infinity logo */}
      <path
        d="M27.2 9.6c-2.1 0-3.8 1.2-5.2 3.3L18 18.6l-4-5.7c-1.4-2.1-3.1-3.3-5.2-3.3-1.8 0-3.3.8-4.5 2.3C3 13.7 2 16.5 2 19.5c0 2.3.6 4.2 1.7 5.5 1.1 1.3 2.5 2 4.1 2 2.1 0 3.8-1.2 5.2-3.3l4-5.7 4 5.7c1.4 2.1 3.1 3.3 5.2 3.3 1.6 0 3-0.7 4.1-2C31.4 23.7 34 21.8 34 19.5c0-3-1-5.8-2.3-7.6-1.2-1.5-2.7-2.3-4.5-2.3Zm-19.4 14c-.9 0-1.7-.4-2.3-1.2-.7-1-1.1-2.3-1.1-3.9 0-2.2.6-4.2 1.5-5.4.7-.9 1.4-1.3 2.2-1.3 1.2 0 2.3.8 3.3 2.5l3.3 4.7-2.2 3.1c-1.4 2-2.8 2.8-4 2.8-.3-.1-.5-.2-.7-.3Zm19.4 0c-.2.1-.4.2-.7.3-1.2 0-2.6-.8-4-2.8l-2.2-3.1 3.3-4.7c1-1.7 2.1-2.5 3.3-2.5.8 0 1.5.4 2.2 1.3.9 1.2 1.5 3.2 1.5 5.4 0 1.6-.4 2.9-1.1 3.9-.6.8-1.4 1.2-2.3 1.2Z"
        fill="#0081FB"
      />
    </svg>
  );
}

export function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335"/>
    </svg>
  );
}

export function KlaviyoLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Klaviyo flag/arrow mark */}
      <path d="M2 3v18l10-6 10 6V3H2Z" fill="#2BD889" />
      <path d="M12 15L2 21V3h20v18l-10-6Z" fill="#2BD889" />
    </svg>
  );
}

export function FreshdeskLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#15C39A"/>
      <path
        d="M7 8h10M7 12h7M7 16h4"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
