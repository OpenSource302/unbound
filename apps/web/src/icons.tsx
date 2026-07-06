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
        fill="currentColor"
        d="M4 6.75A2.75 2.75 0 016.75 4h10.5A2.75 2.75 0 0120 6.75v1.1h-1.5v-1.1c0-.69-.56-1.25-1.25-1.25H6.75c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h1.1V20H6.75A2.75 2.75 0 014 17.25V6.75zm14.5 3.5a2.75 2.75 0 012.75 2.75v7.25A2.75 2.75 0 0118.25 22.5H7.75A2.75 2.75 0 015 19.75v-1.1h1.5v1.1c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-7.25c0-.69-.56-1.25-1.25-1.25h-1.1v-1.5h1.1z"
      />
    </svg>
  );
}

export function IconFollow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 4.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zM5.5 20c0-3.04 2.46-5.5 6.5-5.5s6.5 2.46 6.5 5.5v.75H5.5V20zm12.75-9.25h2.5V8h1.5v2.75H22v1.5h-1.75V15h-1.5v-2.75h-2.5v-1.5z"
      />
    </svg>
  );
}

export function IconMute() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3.5a1 1 0 00-1 1v5.17L6.88 6.55A1 1 0 005.5 7v10a1 1 0 001.38.92L11 14.83V20a1 1 0 001 1h1.2a1 1 0 00.74-.33l5.06-5.55H20a1 1 0 001-1v-2.9a1 1 0 00-1-1h-1.08l-1.2-1.32V4.5a1 1 0 00-1-1H12zm7.3 8.2l-6.9 7.58V5.62l6.9 6.08z"
      />
    </svg>
  );
}

export const IconLogo = UnboundLogo;

export function IconSearch() {
  return <IconExplore />;
}

export function IconMedia() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M5 5.5A2.5 2.5 0 017.5 3h9A2.5 2.5 0 0119 5.5v13A2.5 2.5 0 0116.5 21h-9A2.5 2.5 0 015 18.5v-13zM7.5 5a.5.5 0 00-.5.5v9.38l3.15-3.15a1 1 0 011.4 0L14.5 16l2.1-2.1a1 1 0 011.4 0L18.5 16V5.5a.5.5 0 00-.5-.5h-9zM9 8.75A1.25 1.25 0 1010.25 10 1.25 1.25 0 009 8.75z"
      />
    </svg>
  );
}