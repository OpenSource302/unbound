/** Original Unbound icons — not Twitter/X assets. */

export function UnboundLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-label="Unbound">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M10 16c0-3.3 2.7-8 6-8s6 4.7 6 8-2.7 8-6 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line x1="22" y1="10" x2="26" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3l9 8v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V11l9-8z"
      />
    </svg>
  );
}

export function IconExplore() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
      />
    </svg>
  );
}

export function IconLike() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 20s-7-4.6-9-9.2C1.2 7.2 3.6 4 7 4c2 0 3.2 1.2 5 3.2C13.8 5.2 15 4 17 4c3.4 0 5.8 3.2 4 6.8-2 4.6-9 9.2-9 9.2z"
      />
    </svg>
  );
}

export function IconRepost() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M5 8h11a3 3 0 010 6H9m-4-3l3-3M19 16H8a3 3 0 010-6h7m4 3l-3 3"
      />
    </svg>
  );
}

export const IconLogo = UnboundLogo;

export function IconSearch() {
  return <IconExplore />;
}