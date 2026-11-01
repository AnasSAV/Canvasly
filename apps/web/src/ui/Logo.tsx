/** Brand mark + wordmark. */
export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#4262ff" />
        <rect x="7" y="7" width="11" height="11" rx="2.5" fill="#ffd02f" />
        <circle cx="21" cy="21" r="5" fill="#fff" />
      </svg>
      {!compact && <span className="text-[17px] font-bold tracking-tight">canvasly</span>}
    </span>
  );
}
