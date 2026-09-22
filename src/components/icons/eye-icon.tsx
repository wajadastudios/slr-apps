/**
 * Eye / eye-slash icon for the login password-visibility toggle. Matches the
 * stroke-based style of the other small UI icons (e.g. FocusTargetIcon) so it
 * fits the existing glassmorphism design. Color/size via `className`.
 */
export function EyeIcon({ className = "h-4 w-4", open }: { className?: string; open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17.4 17.4 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7c1.4 0 2.6-.3 3.7-.8" />
          <path d="M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.1" />
        </>
      )}
    </svg>
  );
}
