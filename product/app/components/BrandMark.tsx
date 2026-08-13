export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <rect x="7" y="7" width="7" height="7" rx="2" fill="currentColor" stroke="none" />
        <rect x="18" y="7" width="7" height="7" rx="2" fill="currentColor" fillOpacity=".58" stroke="none" />
        <rect x="7" y="18" width="7" height="7" rx="2" fill="currentColor" fillOpacity=".58" stroke="none" />
        <path d="m18.5 21.5 2.2 2.2 4.8-6.2" />
      </svg>
    </span>
  );
}
